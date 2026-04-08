import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Search, Clipboard } from 'lucide-react';

interface YouTubeSearchTabProps {
  onVideoSelect: (url: string, title: string) => void;
}

export function YouTubeSearchTab({ onVideoSelect }: YouTubeSearchTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchUrl, setSearchUrl] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');

  const handleSearch = () => {
    if (!searchQuery.trim()) return;

    // Generate Google search URL for YouTube
    const url = `https://www.google.com/search?igu=1&q=site:youtube.com+${encodeURIComponent(searchQuery)}`;
    setSearchUrl(url);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.includes('youtube.com') || text.includes('youtu.be'))) {
        setPasteUrl(text);
        // Auto-add the song
        handleAddFromPaste(text);
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
      {/* Search Input */}
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
          Search
        </Button>
      </div>

      {/* Quick Paste Button */}
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Or paste YouTube URL here..."
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
          title="Paste from clipboard"
        >
          <Clipboard className="h-4 w-4" />
        </Button>
      </div>

      {/* Embedded Google Search Results */}
      {searchUrl && (
        <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
          <div className="p-2 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
            <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>
              🎵 Click any result → Copy URL → Paste above
            </p>
            <Button
              onClick={() => setSearchUrl('')}
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
            >
              Close
            </Button>
          </div>
          <iframe
            src={searchUrl}
            className="w-full"
            style={{ height: '400px', border: 'none' }}
            title="YouTube Search Results"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        </div>
      )}

      {!searchUrl && (
        <p className="text-xs opacity-60 text-center" style={{ color: 'white' }}>
          💡 Search for music, click a result, copy the URL, and paste it above
        </p>
      )}
    </div>
  );
}
