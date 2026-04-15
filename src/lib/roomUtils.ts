// Generate random username (adjective + animal)
const adjectives = [
  'happy', 'lazy', 'sleepy', 'bouncy', 'fluffy', 'mighty', 'tiny', 'swift',
  'brave', 'clever', 'gentle', 'wild', 'calm', 'bright', 'dark', 'cool',
  'warm', 'fresh', 'sweet', 'spicy', 'silly', 'wise', 'kind', 'bold',
];

const animals = [
  'panda', 'koala', 'fox', 'wolf', 'bear', 'tiger', 'lion', 'eagle',
  'owl', 'hawk', 'deer', 'rabbit', 'cat', 'dog', 'otter', 'seal',
  'penguin', 'dolphin', 'whale', 'shark', 'turtle', 'frog', 'duck', 'goose',
];

export function generateRandomUsername(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj}-${animal}`;
}

// Generate or get user ID from localStorage
export function getUserId(): string {
  let userId = localStorage.getItem('chill-room-user-id');
  if (!userId) {
    userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('chill-room-user-id', userId);
  }
  return userId;
}

// Generate or get username from localStorage
export function getUsername(): string {
  let username = localStorage.getItem('chill-room-username');
  if (!username) {
    username = generateRandomUsername();
    localStorage.setItem('chill-room-username', username);
  }
  return username;
}

// Save username to localStorage
export function saveUsername(username: string): void {
  localStorage.setItem('chill-room-username', username);
}

// Generate room ID
export function generateRoomId(): string {
  return Math.random().toString(36).substr(2, 8);
}

// Pastel palette — all values contrast-check against warm-ink (#3b2f2a) text.
const PASTEL_USER_COLORS = [
  '#ff9a76', '#7dc8ff', '#ffd76a', '#6ec1a7', '#ff7a93',
  '#a78bfa', '#4fd1c5', '#ffb347', '#b784e0', '#60c3e8',
];

// Deterministic color for a user id — stable across sessions.
export function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PASTEL_USER_COLORS[Math.abs(hash) % PASTEL_USER_COLORS.length];
}

// Short relative time: "now", "2m", "1h", "yesterday", "Apr 10"
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 45_000) return 'now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24 && now.getDate() === then.getDate()) return `${hours}h`;
  const dayDiff = Math.floor((now.setHours(0, 0, 0, 0) - new Date(then).setHours(0, 0, 0, 0)) / 86_400_000);
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff < 7) return then.toLocaleDateString('en-US', { weekday: 'short' });
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Clock-style timestamp for message rows
export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Messenger-style "jumbo" emoji: a chat message made of only 1–3 emoji
// renders larger with no bubble. We split into grapheme clusters so
// composite emoji (👨‍👩‍👧, 🏳️‍🌈) count as one, then require every
// cluster to be pictographic / emoji-component.
const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}\p{Emoji_Component}\uFE0F\u200D]+$/u;
export function isJumboEmojiMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
    return trimmed.length <= 8 && EMOJI_ONLY_RE.test(trimmed);
  }
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let count = 0;
  for (const { segment } of segmenter.segment(trimmed)) {
    if (!EMOJI_ONLY_RE.test(segment)) return false;
    count += 1;
    if (count > 3) return false;
  }
  return count > 0;
}

// Day-bucket key for grouping messages into Today / Yesterday / Month Day
export function formatDateSeparator(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const startToday = new Date(now).setHours(0, 0, 0, 0);
  const startThen = new Date(then).setHours(0, 0, 0, 0);
  const diffDays = Math.round((startToday - startThen) / 86_400_000);
  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'YESTERDAY';
  if (diffDays < 7) return then.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}
