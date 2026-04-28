Update this file when app purpose, key files, or routes change significantly.

**Current App Description**: Chill Room - A collaborative music listening room with synced YouTube playback, real-time chat, weather ambiance, and multiplayer features using Supabase Realtime.

**Recent Updates**:
- **Refactor (Phase 1-3)**: Extracted realtime/presence/scroll/drift hooks; replaced multi-layer dedup with bounded LRU; stable `room:${id}` channel name (root-cause fix for duplicate messages); split chat into `ChatProvider` with state+dispatch contexts so player/scene live outside the chat subtree.
- **DB-level dedup deferred**: The originally proposed Postgres index `WHERE created_at > now() - interval '...'` is invalid DDL (volatile function); the alternative `content_hash` column was rejected for false-positive risk. App-side LRU is the single source of truth.
- **Redesigned chat UI**: Facebook Messenger-inspired minimalist design with clean bubbles, hover timestamps, and refined typography

**Key Files**:
- `src/App.tsx` - Router + providers
- `src/pages/Index.tsx` - Landing page (create/join room)
- `src/pages/Room.tsx` - Page shell: calls `useRoomRealtime` + `useRoomPresence` once, wires handlers, wraps chat subtree in `ChatProvider`
- `src/features/room/hooks/useRoomRealtime.ts` - Stable `room:${id}` channel + bounded-LRU message dedup
- `src/features/room/hooks/useRoomPresence.ts` - Presence channel + join/leave system messages (uses React 19.2 `useEffectEvent`)
- `src/features/room/ChatProvider.tsx` - Two-context split (`ChatStateContext` / `ChatDispatchContext`)
- `src/components/RoomScene.tsx` - CSS-illustrated cozy room scene (memoized)
- `src/components/WeatherOverlay.tsx` - Weather animations (rain/sun/night), now activated via `<WeatherOverlay weather={room.weather} />` in Room
- `src/components/YouTubePlayer.tsx` - Synced YouTube player component (memoized)
- `src/components/youtube/useDriftCorrection.ts` - 1.5s drift threshold, primitive-keyed deps
- `src/components/ChatSidebar.tsx` - Real-time chat with username editing (Facebook Messenger style)
- `src/components/chat/MessageItem.tsx` - Single message bubble + reaction palette
- `src/components/chat/MessageReactions.tsx` - Reaction-chip row + reactor-list popovers; exports `groupReactions`
- `src/components/chat/useChatScroll.ts` - Auto-scroll / IntersectionObserver / ResizeObserver / fonts.ready re-pin
- `src/lib/youtube.ts` - Hoisted `getVideoId` / `getThumbnail` (frozen regex array)
- `src/lib/roomUtils.ts` - Random usernames, color hashing, time formatting; module-level `Intl.Segmenter` + `Intl.DateTimeFormat`
- `src/lib/supabaseClient.ts` - Supabase client with Realtime support
- `src/index.css` - Tailwind + room scene styles + weather animations + Facebook-inspired chat UI

**Database Tables**:
- `rooms` - Room state (weather, current song, timestamp)
- `playlist` - Song queue per room
- `messages` - Chat history (last 50 per room)
- `room_members` - Active users with usernames

**Current Routes**:
- `/` - Landing page (create or join room)
- `/room` - Create new room (redirects to /room/:id)
- `/room/:roomId` - Room page with music, chat, and ambiance
