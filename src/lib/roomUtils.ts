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
