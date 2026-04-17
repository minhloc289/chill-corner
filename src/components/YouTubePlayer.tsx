import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Play, Pause, SkipForward, CirclePause, CirclePlay, ChevronDown, Plus, ListMusic } from 'lucide-react';
import { Card } from './ui/card';
import { YouTubeSearchTab } from './YouTubeSearchTab';
import { VolumeControl } from './VolumeControl';
import { ProgressBar } from './ProgressBar';
import { QueuePreview } from './QueuePreview';

// Default ambient music for when queue is empty
// Using shorter, confirmed-working videos instead of live streams for better reliability
const DEFAULT_MUSIC = [
  { url: 'https://www.youtube.com/watch?v=1fueZCTYkpA', title: 'Lofi Beats - Study & Relax' },
  { url: 'https://www.youtube.com/watch?v=BrnDlRmW5hs', title: 'Chill Lofi Mix - Coffee Shop Vibes' },
  { url: 'https://www.youtube.com/watch?v=7NOSDKb0HlU', title: 'Calm Piano Music - Peaceful Ambiance' },
  { url: 'https://www.youtube.com/watch?v=36YnV9STBqc', title: 'Chillhop Essentials - Relaxing Beats' },
];

// No configuration needed - using simple Google search

interface Song {
  id: string;
  url: string;
  title: string;
  added_by: string;
  position: number;
}

interface YouTubePlayerProps {
  currentSong: {
    url: string;
    title: string;
    startedAt: string;
  } | null;
  playlist: Song[];
  onAddSong: (url: string, title: string) => void;
  onSkip: () => void;
  onRemoveSong?: (songId: string) => void;
  isPaused?: boolean;
  onTogglePause?: () => void;
  isChatOpen?: boolean;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export function YouTubePlayer({ currentSong, playlist, onAddSong, onSkip, onRemoveSong, isPaused = false, onTogglePause, isChatOpen = true }: YouTubePlayerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const playerContainerId = useRef(`youtube-player-${Math.random().toString(36).substr(2, 9)}`);
  const [isReady, setIsReady] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isPlayingDefault, setIsPlayingDefault] = useState(false);
  const [currentDefaultIndex, setCurrentDefaultIndex] = useState(0);
  const defaultMusicStartedAt = useRef<number>(0);
  const isPlayingDefaultRef = useRef(false);
  const currentDefaultIndexRef = useRef(0);
  const onSkipRef = useRef(onSkip);

  // Keep refs in sync with state for event handlers
  useEffect(() => {
    isPlayingDefaultRef.current = isPlayingDefault;
    currentDefaultIndexRef.current = currentDefaultIndex;
    onSkipRef.current = onSkip;
  }, [isPlayingDefault, currentDefaultIndex, onSkip]);

  // Extract YouTube video ID from URL
  const getVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  // Load YouTube IFrame API
  useEffect(() => {
    // Check if API is already loaded
    if (window.YT && window.YT.Player) {
      setApiReady(true);
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (existingScript) {
      // Wait for it to load
      window.onYouTubeIframeAPIReady = () => {
        setApiReady(true);
      };
      return;
    }

    // Load the script
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      setApiReady(true);
    };
  }, []);

  // Initialize player when API is ready
  useEffect(() => {
    if (!apiReady || playerRef.current) return;

    const initPlayer = () => {
      try {
        playerRef.current = new window.YT.Player(playerContainerId.current, {
          height: '1',
          width: '1',
          videoId: '',
          playerVars: {
            autoplay: 1,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              setIsReady(true);
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onStateChange: (event: any) => {
              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true);
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setIsPlaying(false);
              } else if (event.data === window.YT.PlayerState.ENDED) {
                setIsPlaying(false);
                if (isPlayingDefaultRef.current) {
                  const nextIndex = (currentDefaultIndexRef.current + 1) % DEFAULT_MUSIC.length;
                  setCurrentDefaultIndex(nextIndex);
                } else {
                  onSkipRef.current();
                }
              }
            },
            onError: () => {
              setTimeout(() => {
                if (isPlayingDefaultRef.current) {
                  const nextIndex = (currentDefaultIndexRef.current + 1) % DEFAULT_MUSIC.length;
                  setCurrentDefaultIndex(nextIndex);
                } else {
                  onSkipRef.current();
                }
              }, 2000);
            },
          },
        });
      } catch (error) {
        console.error('Error initializing YouTube player:', error);
      }
    };

    // Small delay to ensure DOM is ready
    setTimeout(initPlayer, 100);

    return () => {
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [apiReady]);

  // Sync player with current song OR play default music
  useEffect(() => {
    if (!isReady || !playerRef.current) return;

    // CASE 1: User has a song playing
    if (currentSong) {
      const videoId = getVideoId(currentSong.url);
      if (!videoId) return;

      if (isPlayingDefault) setIsPlayingDefault(false);

      // Only check video ID for "same song" — ignore startedAt changes from pause/resume
      const isSameVideo = currentVideoId === videoId;

      if (!isSameVideo) {
        // New song: load and seek to correct position
        try {
          const elapsedSeconds = Math.max(0, (Date.now() - new Date(currentSong.startedAt).getTime()) / 1000);

          playerRef.current.loadVideoById({
            videoId,
            startSeconds: elapsedSeconds,
          });

          setTimeout(() => {
            // Only auto-play if room is NOT paused
            if (!isPaused) {
              playerRef.current?.playVideo();
            } else {
              playerRef.current?.pauseVideo();
            }
          }, 500);

          setCurrentVideoId(videoId);
        } catch (error) {
          console.error('Error loading video:', error);
        }
      }
    }
    // CASE 2: No user song, no playlist -> Play default music
    else if (!currentSong && playlist.length === 0) {
      const defaultTrack = DEFAULT_MUSIC[currentDefaultIndex];
      const videoId = getVideoId(defaultTrack.url);
      if (!videoId) return;

      if (!isPlayingDefault || currentVideoId !== videoId) {
        setIsPlayingDefault(true);

        try {
          playerRef.current.loadVideoById({ videoId, startSeconds: 0 });

          setTimeout(() => {
            playerRef.current?.playVideo();
          }, 500);

          setCurrentVideoId(videoId);
          defaultMusicStartedAt.current = Date.now();
        } catch (error) {
          console.error('Error loading default music:', error);
        }
      }
    }
    // CASE 3: No current song but playlist exists -> Stop
    else if (!currentSong && playlist.length > 0) {
      if (currentVideoId) {
        setCurrentVideoId(null);
        setIsPlayingDefault(false);
        try { playerRef.current?.stopVideo(); } catch { /* ignore */ }
      }
    }
  }, [currentSong, playlist.length, isReady, currentVideoId, isPlayingDefault, currentDefaultIndex, isPaused]);

  // Periodic sync check to keep playback aligned (only for user songs, not default music)
  useEffect(() => {
    // Clear any existing interval
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }

    // Only sync if we have a USER song (not default music), player is ready, and not paused
    if (!currentSong || !isReady || !playerRef.current || !currentVideoId || isPlayingDefault || isPaused) {
      return;
    }

    // Check sync every 3 seconds
    syncIntervalRef.current = setInterval(() => {
      if (!playerRef.current || !currentSong) return;

      try {
        const currentTime = playerRef.current.getCurrentTime();
        const startedAt = new Date(currentSong.startedAt).getTime();
        const now = Date.now();
        const expectedTime = (now - startedAt) / 1000;
        const drift = Math.abs(currentTime - expectedTime);

        // Tighter drift tolerance (1.5s) for better cross-user sync
        if (drift > 1.5) {
          playerRef.current.seekTo(expectedTime, true);
          const state = playerRef.current.getPlayerState();
          if (state !== window.YT.PlayerState.PLAYING) {
            playerRef.current.playVideo();
          }
        }
      } catch { /* ignore */ }
    }, 3000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [currentSong, isReady, currentVideoId, isPlayingDefault, isPaused]);

  // Room-wide pause/resume: react to isPaused from room state
  useEffect(() => {
    if (!isReady || !playerRef.current) return;

    if (isPaused) {
      playerRef.current.pauseVideo();
    } else if (currentSong || isPlayingDefault) {
      // On resume: seek to the correct position based on updated startedAt, then play
      if (currentSong) {
        const elapsedSeconds = Math.max(0, (Date.now() - new Date(currentSong.startedAt).getTime()) / 1000);
        playerRef.current.seekTo(elapsedSeconds, true);
      }
      playerRef.current.playVideo();
    }
  }, [isPaused, isReady, currentSong]);

  const togglePlayPause = () => {
    if (!playerRef.current) return;

    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const getThumbnail = (url: string): string => {
    const videoId = getVideoId(url);
    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    }
    return '';
  };

  const currentThumbnail = currentSong
    ? getThumbnail(currentSong.url)
    : isPlayingDefault
    ? getThumbnail(DEFAULT_MUSIC[currentDefaultIndex].url)
    : '';

  return (
    <div className={`audio-player-container ${isChatOpen ? 'chat-open' : ''}`}>
      {/* Hidden YouTube player */}
      <div id={playerContainerId.current} style={{ position: 'absolute', left: '-9999px' }} />

      {/* Floating pixel music notes */}
      {isPlaying && (
        <div className="pixel-notes-container" aria-hidden="true">
          <div className="pixel-note" />
          <div className="pixel-note" />
          <div className="pixel-note" />
        </div>
      )}

      {/* Enhanced Audio Control Bar */}
      <Card className="audio-control-bar-enhanced pixel-corners">
        {/* Top row: Controls + Info + Expand button */}
        <div className="flex items-center gap-4 w-full">
          {/* Left: Playback controls */}
          <div className="audio-controls-left">
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePlayPause}
              disabled={!currentSong && !isPlayingDefault}
              className="h-10 w-10"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onSkip}
              disabled={!currentSong && !isPlayingDefault}
              className="h-10 w-10"
              aria-label="Next song"
            >
              <SkipForward className="h-5 w-5" />
            </Button>
            {(currentSong || isPlayingDefault) && onTogglePause && (
              <button
                type="button"
                className={`global-pause-btn ${isPaused ? 'global-pause-btn-active' : ''}`}
                onClick={onTogglePause}
              >
                {isPaused ? (
                  <><CirclePlay className="h-4 w-4" /> RESUME</>
                ) : (
                  <><CirclePause className="h-4 w-4" /> BREAK</>
                )}
              </button>
            )}
          </div>

          {/* Center: Thumbnail + Song info */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Thumbnail */}
            {currentThumbnail && (
              <div className="w-14 h-14 overflow-hidden flex-shrink-0 pixel-border" style={{ borderRadius: '4px' }}>
                <img
                  src={currentThumbnail}
                  alt="Song thumbnail"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Song info */}
            <div className="audio-info flex-1 min-w-0">
              {currentSong ? (
                <>
                  <p className="audio-title">{currentSong.title}</p>
                  <div className="audio-meta-row">
                    <p className="audio-subtitle">
                      {isPlaying && !isPaused && (
                        <span className="pixel-equalizer" aria-hidden="true">
                          <span className="pixel-eq-bar" />
                          <span className="pixel-eq-bar" />
                          <span className="pixel-eq-bar" />
                          <span className="pixel-eq-bar" />
                        </span>
                      )}
                      {isPaused ? 'Paused' : 'Now Playing'}
                    </p>
                    {playlist.length > 0 && (
                      <p className="audio-next-up">
                        Next: <span className="audio-next-title">{playlist[0].title}</span>
                        {playlist.length > 1 && <span className="audio-next-more"> +{playlist.length - 1}</span>}
                      </p>
                    )}
                  </div>
                </>
              ) : isPlayingDefault ? (
                <>
                  <p className="audio-title">
                    {DEFAULT_MUSIC[currentDefaultIndex].title}
                  </p>
                  <p className="audio-subtitle">
                    {isPlaying && (
                      <span className="pixel-equalizer" aria-hidden="true">
                        <span className="pixel-eq-bar" />
                        <span className="pixel-eq-bar" />
                        <span className="pixel-eq-bar" />
                        <span className="pixel-eq-bar" />
                      </span>
                    )}
                    Ambient Music / Add songs to queue
                  </p>
                </>
              ) : (
                <p className="audio-subtitle">No song playing</p>
              )}
            </div>
          </div>

          {/* Right: Queue CTA + Volume */}
          <div className="audio-controls-right-group">
            <button
              type="button"
              className={`queue-cta ${showAddForm ? 'queue-cta-active' : ''}`}
              onClick={() => setShowAddForm(!showAddForm)}
              title={showAddForm ? 'Hide queue' : 'Add songs to queue'}
            >
              {showAddForm ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              <span className="queue-cta-label">
                {showAddForm ? 'CLOSE' : 'ADD'}
              </span>
            </button>

            {playlist.length > 0 && (
              <div className="queue-chip" title={`${playlist.length} in queue`}>
                <ListMusic className="h-3.5 w-3.5" />
                <span className="queue-chip-count">{playlist.length}</span>
              </div>
            )}

            <div className="audio-controls-divider" aria-hidden="true" />

            <VolumeControl playerRef={playerRef} isReady={isReady} />
          </div>
        </div>

        {/* Bottom row: Progress bar */}
        <div className="w-full mt-2">
          <ProgressBar playerRef={playerRef} isReady={isReady} isPlaying={isPlaying} />
        </div>
      </Card>

      {/* Add Song Form (Expandable) */}
      {showAddForm && (
        <Card className="add-song-expanded">
          <div className="add-song-form">
            <YouTubeSearchTab
              onVideoSelect={(url, title) => {
                onAddSong(url, title);
              }}
            />
          </div>
          <QueuePreview playlist={playlist} onRemoveSong={onRemoveSong} />
        </Card>
      )}
    </div>
  );
}
