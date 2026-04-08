import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Search, Clipboard, ExternalLink, Music2 } from 'lucide-react';

interface YouTubeSearchTabProps {
  onVideoSelect: (url: string, title: string) => void;
}

const QUICK_SUGGESTIONS = [
  'Lofi hip hop',
  'Chill beats',
  'Study music',
  'Relaxing piano',
  'Ambient sounds',
];

const BROWSE_PLAYLISTS = [
  { title: 'Lofi Beats - Study & Relax', url: 'https://www.youtube.com/watch?v=1fueZCTYkpA' },
  { title: 'Chill Lofi Mix - Coffee Shop Vibes', url: 'https://www.youtube.com/watch?v=BrnDlRmW5hs' },
  { title: 'Calm Piano Music - Peaceful Ambiance', url: 'https://www.youtube.com/watch?v=7NOSDKb0HlU' },
  { title: 'Chillhop Essentials - Relaxing Beats', url: 'https://www.youtube.com/watch?v=36YnV9STBqc' },
];

export function YouTubeSearchTab({ onVideoSelect }: YouTubeSearchTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [activeTab, setActiveTab] = useState('search');

  const handleSearch = () => {
    if (!searchQuery.trim()) return;

    // Open YouTube search in a new tab
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    window.open(url, '_blank');
  };

  const handleQuickSearch = (suggestion: string) => {
    setSearchQuery(suggestion);
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(suggestion)}`;
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

  const handleBrowseSelect = async (url: string, title: string) => {
    onVideoSelect(url, title);
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
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-3 bg-white/10">
        <TabsTrigger value="search" className="text-white data-[state=active]:bg-white/20">
          <Search className="h-3.5 w-3.5 mr-1.5" />
          Search
        </TabsTrigger>
        <TabsTrigger value="paste" className="text-white data-[state=active]:bg-white/20">
          <Clipboard className="h-3.5 w-3.5 mr-1.5" />
          Paste URL
        </TabsTrigger>
        <TabsTrigger value="browse" className="text-white data-[state=active]:bg-white/20">
          <Music2 className="h-3.5 w-3.5 mr-1.5" />
          Browse
        </TabsTrigger>
      </TabsList>

      <TabsContent value="search" className="space-y-3">
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
            className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50"
            autoFocus
          />
          <Button onClick={handleSearch} type="button" className="gap-2">
            <Search className="h-4 w-4" />
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>

        {/* Quick Suggestions */}
        {!searchQuery && (
          <div className="space-y-2">
            <p className="text-xs text-white/70">Quick suggestions:</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleQuickSearch(suggestion)}
                  className="suggestion-chip"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-white/50 text-center pt-2">
          💡 Search opens YouTube in a new tab • Copy the URL and paste it in the "Paste URL" tab
        </p>
      </TabsContent>

      <TabsContent value="paste" className="space-y-3">
        {/* Paste Input */}
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
            className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50"
          />
          <Button
            onClick={handlePasteFromClipboard}
            type="button"
            variant="outline"
            className="gap-2 border-white/20 text-white hover:bg-white/10"
            title="Paste from clipboard and add to queue"
          >
            <Clipboard className="h-4 w-4" />
            Paste & Add
          </Button>
        </div>

        <p className="text-xs text-white/50 text-center pt-2">
          💡 The clipboard button auto-detects and adds YouTube URLs
        </p>
      </TabsContent>

      <TabsContent value="browse" className="space-y-2">
        <p className="text-xs text-white/70 mb-3">Popular chill playlists:</p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {BROWSE_PLAYLISTS.map((playlist, index) => {
            const videoId = extractVideoId(playlist.url);
            const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '';

            return (
              <button
                key={index}
                onClick={() => handleBrowseSelect(playlist.url, playlist.title)}
                className="browse-playlist-item group"
              >
                {thumbnail && (
                  <div className="w-16 h-12 rounded overflow-hidden flex-shrink-0">
                    <img
                      src={thumbnail}
                      alt={playlist.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-white truncate group-hover:text-blue-300 transition-colors">
                    {playlist.title}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </TabsContent>
    </Tabs>
  );
}
