import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface YouTubeSearchTabProps {
  onVideoSelect: (url: string, title: string) => void;
  searchEngineId: string;
}

export function YouTubeSearchTab({
  onVideoSelect,
  searchEngineId
}: YouTubeSearchTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    // Prevent loading script multiple times
    if (scriptLoadedRef.current) {
      setIsLoading(false);
      return;
    }

    // Load Google Custom Search script
    const script = document.createElement('script');
    script.src = `https://cse.google.com/cse.js?cx=${searchEngineId}`;
    script.async = true;

    script.onload = () => {
      console.log('✅ Google Custom Search loaded');
      setIsLoading(false);
      scriptLoadedRef.current = true;
    };

    script.onerror = () => {
      console.error('❌ Failed to load Google Custom Search');
      setIsLoading(false);
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup if component unmounts
      if (script.parentNode) {
        document.head.removeChild(script);
      }
    };
  }, [searchEngineId]);

  useEffect(() => {
    // Intercept clicks on search results
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Find the closest anchor tag
      const link = target.closest('a');

      if (!link) return;

      const href = link.href;

      // Check if it's a YouTube link
      if (href && (href.includes('youtube.com/watch') || href.includes('youtu.be/'))) {
        e.preventDefault();
        e.stopPropagation();

        console.log('🎵 YouTube link clicked:', href);

        // Extract title from the result
        // Google search results have class 'gs-title'
        const titleElement = link.querySelector('.gs-title') ||
                           link.querySelector('.gs-snippet') ||
                           link;
        const title = titleElement?.textContent?.trim() || 'YouTube Video';

        // Clean up title (remove "..." and extra whitespace)
        const cleanTitle = title.replace(/\s+/g, ' ').replace(/\.\.\.$/, '').trim();

        console.log('📝 Adding song:', cleanTitle);

        // Call the callback to add the video
        onVideoSelect(href, cleanTitle);
      }
    };

    // Attach click listener to the container
    const container = containerRef.current;
    if (container) {
      container.addEventListener('click', handleClick, true); // Use capture phase
    }

    return () => {
      if (container) {
        container.removeEventListener('click', handleClick, true);
      }
    };
  }, [onVideoSelect]);

  return (
    <div ref={containerRef} className="youtube-search-container">
      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'white' }} />
          <span className="ml-2" style={{ color: 'white' }}>Loading search...</span>
        </div>
      )}

      {/* Google Custom Search Element will be inserted here */}
      <div className="gcse-search"></div>

      <p className="text-xs mt-3 opacity-70" style={{ color: 'white' }}>
        💡 Tip: Click any YouTube result to add it to your queue
      </p>
    </div>
  );
}
