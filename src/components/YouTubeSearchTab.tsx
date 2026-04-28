import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Search, Link, Plus } from 'lucide-react';
import { getVideoId } from '@/lib/youtube';

interface YouTubeSearchTabProps {
  onVideoSelect: (url: string, title: string) => void;
}

const QUICK_SUGGESTIONS = [
  'Lofi hip hop',
  'Chill beats',
  'Study music',
  'Piano',
  'Jazz',
];

export function YouTubeSearchTab({ onVideoSelect }: YouTubeSearchTabProps) {
  const [inputValue, setInputValue] = useState('');
  const [mode, setMode] = useState<'search' | 'paste'>('search');
  // Increments on each successful add so we can re-key the burst element
  // and replay its CSS animation from the start.
  const [burstKey, setBurstKey] = useState(0);

  const isYouTubeUrl = (text: string) => {
    return text.includes('youtube.com/') || text.includes('youtu.be/');
  };

  const handleSearch = () => {
    if (!inputValue.trim()) return;
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(inputValue)}`;
    window.open(url, '_blank');
  };

  const handleAddUrl = async (url: string) => {
    if (!url.trim()) return;
    const videoId = getVideoId(url);
    if (!videoId) {
      alert('Invalid YouTube URL');
      return;
    }
    try {
      const response = await fetch(
        `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`
      );
      const data = await response.json();
      onVideoSelect(url, data.title || 'Untitled Video');
    } catch {
      onVideoSelect(url, 'Untitled Video');
    }
    setInputValue('');
    setBurstKey((k) => k + 1);
  };

  const handleSubmit = () => {
    if (isYouTubeUrl(inputValue)) {
      handleAddUrl(inputValue);
    } else {
      handleSearch();
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (isYouTubeUrl(text)) {
        handleAddUrl(text);
      } else {
        setInputValue(text);
      }
    } catch {
      setMode('paste');
    }
  };

  const hasUrl = isYouTubeUrl(inputValue);

  return (
    <div className="add-song-controls">
      {/* Label */}
      <div className={`add-song-label ${hasUrl ? 'add-song-label-ready' : ''}`}>
        <Search className="h-3 w-3" />
        <span>{hasUrl ? 'Ready to add' : 'Add Music'}</span>
      </div>

      {/* Input row */}
      <div className={`add-song-input-row ${hasUrl ? 'add-song-input-url' : ''}`}>
        <Input
          type="text"
          placeholder="Paste YouTube URL or search..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          className="add-song-input"
        />
        <div className="add-song-actions">
          <button
            onClick={handlePasteFromClipboard}
            className="add-song-paste-btn"
            title="Paste from clipboard"
          >
            <Link className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleSubmit}
            className="add-song-search-btn"
            title={hasUrl ? 'Add to queue' : 'Search YouTube'}
          >
            {hasUrl ? (
              <Plus className="h-4 w-4" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {/* Success celebration — pixel DJ cat pops up above the input
            whenever a song is added. Re-keyed React element replays the
            whole animation from scratch every add. */}
        {burstKey > 0 && (
          <div key={burstKey} className="add-song-burst" aria-hidden="true">
            <div className="add-song-character">
              <div className="asc-headphones">
                <div className="asc-headphones-band" />
                <div className="asc-ear-cup asc-ear-cup-left" />
                <div className="asc-ear-cup asc-ear-cup-right" />
              </div>
              <div className="asc-head">
                <div className="asc-ear asc-ear-left" />
                <div className="asc-ear asc-ear-right" />
                <div className="asc-eye asc-eye-left" />
                <div className="asc-eye asc-eye-right" />
                <div className="asc-blush asc-blush-left" />
                <div className="asc-blush asc-blush-right" />
                <div className="asc-mouth" />
              </div>
              <div className="asc-arm asc-arm-left" />
              <div className="asc-arm asc-arm-right" />
              <div className="asc-speech">+1</div>
            </div>
            <span className="add-song-burst-note add-song-burst-note-1" />
            <span className="add-song-burst-note add-song-burst-note-2" />
            <span className="add-song-burst-note add-song-burst-note-3" />
            <span className="add-song-burst-note add-song-burst-note-4" />
          </div>
        )}
      </div>

      {/* Quick suggestion chips */}
      {!inputValue && (
        <div className="add-song-chips">
          {QUICK_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(s)}`;
                window.open(url, '_blank');
              }}
              className="suggestion-chip"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
