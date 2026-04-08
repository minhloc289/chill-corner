import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Search, Clipboard, ExternalLink } from 'lucide-react';

interface YouTubeSearchTabProps {
  onVideoSelect: (url: string, title: string) => void;
}

export function YouTubeSearchTab({ onVideoSelect }: YouTubeSearchTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');

  const handleSearch = () => {
    if (!searchQuery.trim()) return;

    // Open YouTube search in a new tab
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    window.open(url, '_blank');
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.includes('youtube.com') || text.includes('youtu.be'))) {
        setPasteUrl(text);
        // Auto-add the song
        handleAddFromPaste(text);
      } else {
        alert('No YouTube URL found in clipboard');
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      alert('Please paste the URL manually or allow clipboard access');
    }
  };

  const handleAddFromPaste = async (url: string) => {
    if (!url.trim()) return;

    const videoId = extractVideoId(url);
    if (!videoId) {
      alert('Invalid YouTube URL');
      return;
    }

    // Fetch video title
    try {
      const response = await fetch(
        `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`
      );
      const data = await response.json();
      const title = data.title || 'Untitled Video';

      onVideoSelect(url, title);
      setPasteUrl('');
      setSearchQuery('');
    } catch (error) {
      console.error('Error fetching video info:', error);
      onVideoSelect(url, 'Untitled Video');
      setPasteUrl('');
    }
  };

  const extractVideoId = (url: string) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  return (
    <div className="space-y-3">
      {/* Search Input - Opens YouTube in new tab */}
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Search YouTube..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSearch();
            }
          }}
          className="flex-1"
          autoFocus
        />
        <Button onClick={handleSearch} type="button" className="gap-2">
          <Search className="h-4 w-4" />
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>

      {/* Quick Paste Button */}
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Paste YouTube URL here..."
          value={pasteUrl}
          onChange={(e) => setPasteUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddFromPaste(pasteUrl);
            }
          }}
          className="flex-1"
        />
        <Button
          onClick={handlePasteFromClipboard}
          type="button"
          variant="outline"
          className="gap-2"
          title="Paste from clipboard and add to queue"
        >
          <Clipboard className="h-4 w-4" />
          Paste & Add
        </Button>
      </div>

      {/* Instructions */}
      <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
        <div className="text-xs space-y-1.5" style={{ color: 'rgba(255,255,255,0.85)' }}>
          <p className="font-semibold flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" />
            How to add songs:
          </p>
          <ol className="list-decimal list-inside space-y-1 opacity-90 ml-1">
            <li>Type a song name and click Search (opens YouTube)</li>
            <li>Find the video you want and copy its URL</li>
            <li>Come back here and paste it, or click "Paste & Add"</li>
          </ol>
        </div>
      </div>

      <p className="text-xs opacity-60 text-center" style={{ color: 'white' }}>
        💡 Tip: The clipboard button auto-detects and adds YouTube URLs
      </p>
    </div>
  );
}
