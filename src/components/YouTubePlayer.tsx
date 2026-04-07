import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Plus, SkipForward } from 'lucide-react';

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
          height: '100%',
          width: '100%',
          videoId: '',
          playerVars: {
            autoplay: 1,
            controls: 1,
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
              // When video ends, skip to next
              if (event.data === window.YT.PlayerState.ENDED) {
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
      return;
    }

    const videoId = getVideoId(currentSong.url);
    if (!videoId) {
      console.error('Invalid video ID for URL:', currentSong.url);
      return;
    }

    try {
      // Calculate elapsed time since song started
      const startedAt = new Date(currentSong.startedAt).getTime();
      const now = Date.now();
      const elapsedSeconds = Math.max(0, (now - startedAt) / 1000);

      console.log('Loading video:', videoId, 'at', elapsedSeconds, 'seconds');

      // Load video and seek to correct position
      playerRef.current.loadVideoById({
        videoId,
        startSeconds: elapsedSeconds,
      });
    } catch (error) {
      console.error('Error loading video:', error);
    }
  }, [currentSong, isReady]);

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
    } catch (error) {
      console.error('Error fetching video info:', error);
      onAddSong(songUrl, 'Untitled Video');
      setSongUrl('');
    }
  };

  return (
    <div className="youtube-player-container">
      <div className="player-wrapper">
        <div className="player-embed">
          <div id={playerContainerId.current} style={{ width: '100%', height: '100%' }} />
          {!apiReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black text-white">
              Loading YouTube player...
            </div>
          )}
        </div>

        {currentSong && (
          <div className="now-playing">
            <h3 className="text-lg font-semibold">Now Playing</h3>
            <p className="text-sm text-muted-foreground">{currentSong.title}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={onSkip}
              className="mt-2"
            >
              <SkipForward className="h-4 w-4 mr-2" />
              Skip
            </Button>
          </div>
        )}

        {!currentSong && playlist.length === 0 && (
          <div className="now-playing">
            <p className="text-sm text-muted-foreground">
              No songs playing. Add a YouTube URL below to get started! 🎵
            </p>
          </div>
        )}
      </div>

      <div className="add-song-form">
        <h3 className="text-lg font-semibold mb-2">Add Song</h3>
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
          />
          <Button onClick={handleAddSong} type="button">
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </div>
      </div>

      <div className="playlist">
        <h3 className="text-lg font-semibold mb-2">Queue ({playlist.length})</h3>
        <div className="playlist-items">
          {playlist.length === 0 ? (
            <p className="text-sm text-muted-foreground">No songs in queue</p>
          ) : (
            playlist.map((song) => (
              <div key={song.id} className="playlist-item">
                <div className="flex-1">
                  <p className="text-sm font-medium">{song.title}</p>
                  <p className="text-xs text-muted-foreground">Added by {song.added_by}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
