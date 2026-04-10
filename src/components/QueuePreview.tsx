import { X } from 'lucide-react';

interface Song {
  id: string;
  url: string;
  title: string;
  added_by: string;
  position: number;
}

interface QueuePreviewProps {
  playlist: Song[];
  onRemoveSong?: (songId: string) => void;
}

export function QueuePreview({ playlist, onRemoveSong }: QueuePreviewProps) {
  if (playlist.length === 0) {
    return null;
  }

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

  const getThumbnail = (url: string): string => {
    const videoId = getVideoId(url);
    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    }
    return '';
  };

  return (
    <div className="queue-preview-container">
      <div className="queue-preview-header">
        <div className="queue-header-left">
          <div className="pixel-cassette" aria-hidden="true">
            <div className="cassette-reel cassette-reel-l" />
            <div className="cassette-reel cassette-reel-r" />
          </div>
          <span className="queue-preview-title">Queue</span>
        </div>
        <div className="queue-header-right">
          <span className="queue-count-badge">{playlist.length}</span>
        </div>
      </div>

      <div className="queue-preview-scroll">
        {playlist.map((song, index) => {
          const thumbnail = getThumbnail(song.url);

          return (
            <div key={song.id} className="queue-preview-item group">
              <span className="queue-preview-number">{index + 1}</span>

              {thumbnail && (
                <div className="queue-preview-thumbnail">
                  <img
                    src={thumbnail}
                    alt={song.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-xs truncate" style={{ color: 'var(--pixel-text-primary)', fontWeight: 500 }}>{song.title}</p>
                <p className="truncate mt-0.5" style={{ color: 'var(--pixel-text-secondary)', fontSize: '10px' }}>by {song.added_by}</p>
              </div>

              {onRemoveSong && (
                <button
                  onClick={() => onRemoveSong(song.id)}
                  className="queue-preview-remove opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove from queue"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
