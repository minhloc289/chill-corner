import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Plus, SkipForward, Play, Pause, Volume2 } from 'lucide-react';
import { Card } from './ui/card';

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
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export function YouTubePlayer({ currentSong, playlist, onAddSong, onSkip }: YouTubePlayerProps) {
  const playerRef = useRef<any>(null);
  const playerContainerId = useRef(`youtube-player-${Math.random().toString(36).substr(2, 9)}`);
  const [songUrl, setSongUrl] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
            onReady: (event: any) => {
              console.log('YouTube player ready');
              setIsReady(true);
            },
            onStateChange: (event: any) => {
              // Update playing state
              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true);
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setIsPlaying(false);
              } else if (event.data === window.YT.PlayerState.ENDED) {
                setIsPlaying(false);
                onSkip();
              }
            },
            onError: (event: any) => {
              console.error('YouTube player error:', event.data);
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

  // Sync player with current song
  useEffect(() => {
    if (!isReady || !playerRef.current || !currentSong) {
      // Clear current video if no song
      if (!currentSong && currentVideoId) {
        setCurrentVideoId(null);
        // Stop playback
        try {
          playerRef.current?.stopVideo();
        } catch (e) {
          console.error('Error stopping video:', e);
        }
      }
      return;
    }

    const videoId = getVideoId(currentSong.url);
    if (!videoId) {
      console.error('Invalid video ID for URL:', currentSong.url);
      return;
    }

    // OPTIMIZATION: Only reload if video actually changed
    if (currentVideoId === videoId) {
      console.log('Video already loaded, skipping reload to prevent stuttering');
      return;
    }

    try {
      // Calculate elapsed time since song started
      const startedAt = new Date(currentSong.startedAt).getTime();
      const now = Date.now();
      const elapsedSeconds = Math.max(0, (now - startedAt) / 1000);

      console.log('Loading video:', videoId, 'at', elapsedSeconds, 'seconds (AUTOPLAY)');

      // Load video and seek to correct position with autoplay
      playerRef.current.loadVideoById({
        videoId,
        startSeconds: elapsedSeconds,
      });

      // Ensure video starts playing after load
      setTimeout(() => {
        if (playerRef.current) {
          playerRef.current.playVideo();
        }
      }, 500);

      setCurrentVideoId(videoId);
    } catch (error) {
      console.error('Error loading video:', error);
    }
  }, [currentSong, isReady, currentVideoId]);

  // Periodic sync check to keep playback aligned
  useEffect(() => {
    // Clear any existing interval
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }

    // Only sync if we have a song and player is ready
    if (!currentSong || !isReady || !playerRef.current || !currentVideoId) {
      return;
    }

    // Check sync every 5 seconds
    syncIntervalRef.current = setInterval(() => {
      if (!playerRef.current || !currentSong) return;

      try {
        const currentTime = playerRef.current.getCurrentTime();
        const startedAt = new Date(currentSong.startedAt).getTime();
        const now = Date.now();
        const expectedTime = (now - startedAt) / 1000;
        const drift = Math.abs(currentTime - expectedTime);

        // If drift is more than 3 seconds, resync
        if (drift > 3) {
          console.log(`Playback drift detected: ${drift.toFixed(2)}s - Resyncing...`);
          playerRef.current.seekTo(expectedTime, true);

          // Ensure it's playing
          const state = playerRef.current.getPlayerState();
          if (state !== window.YT.PlayerState.PLAYING) {
            playerRef.current.playVideo();
          }
        }
      } catch (error) {
        console.error('Error in sync check:', error);
      }
    }, 5000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [currentSong, isReady, currentVideoId]);

  const handleAddSong = async () => {
    if (!songUrl.trim()) return;

    const videoId = getVideoId(songUrl);
    if (!videoId) {
      alert('Invalid YouTube URL. Please paste a valid YouTube video URL.');
      return;
    }

    // Fetch video title from YouTube
    try {
      const response = await fetch(
        `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`
      );
      const data = await response.json();
      const title = data.title || 'Untitled Video';

      onAddSong(songUrl, title);
      setSongUrl('');
      setShowAddForm(false);
    } catch (error) {
      console.error('Error fetching video info:', error);
      onAddSong(songUrl, 'Untitled Video');
      setSongUrl('');
      setShowAddForm(false);
    }
  };

  const togglePlayPause = () => {
    if (!playerRef.current) return;

    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  return (
    <div className="audio-player-container">
      {/* Hidden YouTube player */}
      <div id={playerContainerId.current} style={{ position: 'absolute', left: '-9999px' }} />

      {/* Compact Audio Control Bar */}
      <Card className="audio-control-bar">
        <div className="audio-controls-left">
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlayPause}
            disabled={!currentSong}
            className="h-10 w-10"
            style={{ color: 'white' }}
          >
            {isPlaying ? <Pause className="h-5 w-5" style={{ color: 'white' }} /> : <Play className="h-5 w-5" style={{ color: 'white' }} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onSkip}
            disabled={!currentSong && playlist.length === 0}
            className="h-10 w-10"
            style={{ color: 'white' }}
          >
            <SkipForward className="h-5 w-5" style={{ color: 'white' }} />
          </Button>
          <Volume2 className="h-5 w-5 ml-2" style={{ color: 'white' }} />
        </div>

        <div className="audio-info">
          {currentSong ? (
            <>
              <p className="audio-title" style={{ color: 'white' }}>{currentSong.title}</p>
              <p className="audio-subtitle" style={{ color: 'white' }}>Now Playing • {playlist.length} in queue</p>
            </>
          ) : (
            <p className="audio-subtitle" style={{ color: 'white' }}>No song playing</p>
          )}
        </div>

        <div className="audio-controls-right">
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Song
          </Button>
        </div>
      </Card>

      {/* Add Song Form (Expandable) */}
      {showAddForm && (
        <Card className="add-song-expanded">
          <div className="p-4 space-y-4" style={{ color: 'white' }}>
            <div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'white' }}>Add Song to Queue</h3>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Paste YouTube URL..."
                  value={songUrl}
                  onChange={(e) => setSongUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSong();
                    }
                  }}
                  className="flex-1"
                  autoFocus
                />
                <Button onClick={handleAddSong} type="button">
                  Add
                </Button>
              </div>
            </div>

            {/* Queue Preview */}
            {playlist.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-2" style={{ color: 'white' }}>
                  QUEUE ({playlist.length})
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {playlist.slice(0, 5).map((song) => (
                    <div key={song.id} className="queue-item">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'white' }}>{song.title}</p>
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>by {song.added_by}</p>
                      </div>
                    </div>
                  ))}
                  {playlist.length > 5 && (
                    <p className="text-xs text-center pt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      +{playlist.length - 5} more songs
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
