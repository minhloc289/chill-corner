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
  const containerRef = useRef<HTMLDivElement>(null);
  const [songUrl, setSongUrl] = useState('');
  const [isReady, setIsReady] = useState(false);

  // Extract YouTube video ID from URL
  const getVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  // Load YouTube IFrame API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    } else {
      initPlayer();
    }
  }, []);

  const initPlayer = () => {
    if (!containerRef.current || playerRef.current) return;

    playerRef.current = new window.YT.Player(containerRef.current, {
      height: '315',
      width: '560',
      videoId: '',
      playerVars: {
        autoplay: 0,
        controls: 1,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onReady: () => setIsReady(true),
        onStateChange: (event: any) => {
          // When video ends, skip to next
          if (event.data === window.YT.PlayerState.ENDED) {
            onSkip();
          }
        },
      },
    });
  };

  // Sync player with current song
  useEffect(() => {
    if (!isReady || !playerRef.current || !currentSong) return;

    const videoId = getVideoId(currentSong.url);
    if (!videoId) return;

    // Calculate elapsed time since song started
    const startedAt = new Date(currentSong.startedAt).getTime();
    const now = Date.now();
    const elapsedSeconds = Math.max(0, (now - startedAt) / 1000);

    // Load video and seek to correct position
    playerRef.current.loadVideoById({
      videoId,
      startSeconds: elapsedSeconds,
    });
  }, [currentSong, isReady]);

  const handleAddSong = async () => {
    if (!songUrl.trim()) return;

    const videoId = getVideoId(songUrl);
    if (!videoId) {
      alert('Invalid YouTube URL');
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
        <div ref={containerRef} className="player-embed" />

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
      </div>

      <div className="add-song-form">
        <h3 className="text-lg font-semibold mb-2">Add Song</h3>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Paste YouTube URL..."
            value={songUrl}
            onChange={(e) => setSongUrl(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddSong()}
          />
          <Button onClick={handleAddSong}>
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
