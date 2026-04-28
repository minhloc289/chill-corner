// Module-level frozen regex array for YouTube URL parsing.
// Hoisted from per-component inline copies (YouTubePlayer, YouTubeSearchTab,
// QueuePreview) so the regex objects are compiled once per module load
// rather than once per call.
const YOUTUBE_VIDEO_ID_PATTERNS: readonly RegExp[] = Object.freeze([
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
  /youtube\.com\/shorts\/([^&\n?#]+)/,
  // Bare 11-char video id (used by YouTubeSearchTab when the user pastes just an id).
  /^([a-zA-Z0-9_-]{11})$/,
]);

/**
 * Extract a YouTube video id from a URL or bare id string.
 * Returns null when no pattern matches.
 */
export function getVideoId(input: string): string | null {
  for (const pattern of YOUTUBE_VIDEO_ID_PATTERNS) {
    const match = input.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Convenience: build the medium-quality YouTube thumbnail URL for a given
 * video URL. Returns an empty string when the URL cannot be parsed.
 */
export function getThumbnail(url: string): string {
  const videoId = getVideoId(url);
  return videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '';
}
