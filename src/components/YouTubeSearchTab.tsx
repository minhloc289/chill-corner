import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Search, ExternalLink } from 'lucide-react';

interface YouTubeSearchTabProps {
  onVideoSelect: (url: string, title: string) => void;
}

export function YouTubeSearchTab({ onVideoSelect }: YouTubeSearchTabProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = () => {
    if (!searchQuery.trim()) return;

    // Open Google search for YouTube videos in a new window
    const searchUrl = `https://www.google.com/search?q=site:youtube.com+${encodeURIComponent(searchQuery)}`;
    window.open(searchUrl, '_blank', 'width=800,height=600');
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Search YouTube videos..."
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

      <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
        <div className="flex items-start gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
          <ExternalLink className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: 'rgba(147,197,253,0.8)' }} />
          <div>
            <p className="font-medium mb-1">How to use:</p>
            <ol className="text-xs space-y-1 opacity-80 list-decimal list-inside">
              <li>Click "Search" to open Google in a new window</li>
              <li>Find the YouTube video you want</li>
              <li>Copy the video URL from the address bar</li>
              <li>Come back here and paste it in the "Paste URL" tab</li>
            </ol>
          </div>
        </div>
      </div>

      <p className="text-xs opacity-60 text-center" style={{ color: 'white' }}>
        💡 Tip: Or switch to "Paste URL" tab to directly paste a YouTube link
      </p>
    </div>
  );
}
