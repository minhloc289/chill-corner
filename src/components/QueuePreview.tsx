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
  maxVisible?: number;
}

export function QueuePreview({ playlist, onRemoveSong, maxVisible = 4 }: QueuePreviewProps) {
  if (playlist.length === 0) {
    return null;
  }

  const visibleSongs = playlist.slice(0, maxVisible);
  const remainingCount = playlist.length - maxVisible;

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
      <h4 className="text-xs font-semibold mb-3 text-white/90 flex items-center gap-2">
        <span>UP NEXT</span>
        <span className="text-white/50">• {playlist.length} songs</span>
      </h4>

      <div className="space-y-2">
        {visibleSongs.map((song, index) => {
          const thumbnail = getThumbnail(song.url);

          return (
            <div key={song.id} className="queue-preview-item group">
              {/* Position number */}
              <span className="queue-preview-number">{index + 1}</span>

              {/* Thumbnail */}
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

              {/* Song info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{song.title}</p>
                <p className="text-xs text-white/60 truncate">Added by {song.added_by}</p>
              </div>

              {/* Remove button */}
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

        {remainingCount > 0 && (
          <p className="text-xs text-center text-white/50 pt-2">
            +{remainingCount} more {remainingCount === 1 ? 'song' : 'songs'}
          </p>
        )}
      </div>
    </div>
  );
}
