Update this file when app purpose, key files, or routes change significantly.

**Current App Description**: Chill Room - A collaborative music listening room with synced YouTube playback, real-time chat, weather ambiance, and multiplayer features using Supabase Realtime.

**Key Files**:
- `src/App.tsx` - Router + providers
- `src/pages/Index.tsx` - Landing page (create/join room)
- `src/pages/Room.tsx` - Main room page with realtime sync
- `src/components/RoomScene.tsx` - CSS-illustrated cozy room scene
- `src/components/WeatherOverlay.tsx` - Weather animations (rain/sun/night)
- `src/components/YouTubePlayer.tsx` - Synced YouTube player component
- `src/components/ChatSidebar.tsx` - Real-time chat with username editing
- `src/lib/roomUtils.ts` - Random username generation and room utilities
- `src/lib/supabaseClient.ts` - Supabase client with Realtime support
- `src/index.css` - Tailwind + room scene styles + weather animations

**Database Tables**:
- `rooms` - Room state (weather, current song, timestamp)
- `playlist` - Song queue per room
- `messages` - Chat history (last 50 per room)
- `room_members` - Active users with usernames

**Current Routes**:
- `/` - Landing page (create or join room)
- `/room` - Create new room (redirects to /room/:id)
- `/room/:roomId` - Room page with music, chat, and ambiance
