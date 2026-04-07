# Chill Room — Plan

## Architecture

```
┌─────────────────────────────────────────┐
│              Browser                    │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │   Room   │ │  Player  │ │  Chat   │ │
│  │  Scene   │ │ (YT sync)│ │ sidebar │ │
│  └──────────┘ └──────────┘ └─────────┘ │
│              socket.js                  │
└──────────────────┬──────────────────────┘
                   │ WebSocket
          ┌────────▼────────┐
          │   Node.js WS    │
          │  events:        │
          │  • add-song     │
          │  • skip         │
          │  • weather      │
          │  • chat-msg     │
          │  • user-join    │
          │  • user-leave   │
          │  • rename       │
          │  • user-renamed │
          └─────────────────┘
```

## User / App Flow

```
User opens site → joins a room (default or via share link /room/abc)
        │
        ▼
Server sends current state: playlist, now-playing + timestamp, weather, last 50 msgs
        │
        ▼
Room scene renders, YouTube player seeks to correct position
        │
        ├── Add song (YouTube URL) → broadcast to all → added to queue
        ├── Vote skip              → majority → advance track
        ├── Toggle weather         → all users see same weather
        ├── Chat message           → broadcast to room
        └── Click username         → edit inline → rename event
                                      → system msg: "x is now y"
```

## Overview

- **Static frontend** served by Express, no framework, vanilla JS
- **Room scene** — CSS-illustrated cozy room (window, desk, lamp, bookshelf)
- **Ambiance** — weather overlay (rain / sun / night) synced across users
- **Music** — YouTube IFrame API, server-authoritative playback timestamp
- **Multiplayer** — WebSocket rooms, in-memory state (resets on restart)
- **Chat** — sidebar panel, last 50 messages per room, system join/leave/rename msgs
- **Username** — random adjective+animal on join (e.g. "lazy-panda"), click to rename
- **No login, no database, no build step**

## File Structure

```
chill-room/
├── package.json
├── server/
│   ├── index.js        # Express static + WS server, room routing
│   └── room.js         # Room class: playlist, members, chat history, now-playing
└── client/
    ├── index.html      # App shell, room markup
    ├── style.css       # Room scene, weather animations, chat sidebar, responsive
    ├── socket.js       # WS client — connect, send/receive all events
    ├── player.js       # YouTube IFrame API, sync to server timestamp on join
    ├── room.js         # Weather toggle, day/night, ambient sound
    ├── chat.js         # Chat UI, message list, username edit
    └── assets/
        ├── room.svg    # Room illustration
        ├── rain.svg    # Weather overlays
        └── icons/      # Play, pause, add, send icons
```

## Build Steps

1. **`package.json`** — dependencies: `express`, `ws`, `uuid`
2. **`server/room.js`** — Room class: playlist queue, now-playing + timestamp, member map, chat history (last 50)
3. **`server/index.js`** — Express serves `client/`, WS handles events, broadcasts, room lifecycle
4. **`client/index.html`** — room scene markup + player embed + chat sidebar scaffold
5. **`client/style.css`** — room layout, weather CSS animations, chat panel, responsive
6. **`client/socket.js`** — WS connect, event dispatcher, reconnect logic
7. **`client/player.js`** — YouTube IFrame API init, add-song UI, seek to timestamp on join
8. **`client/room.js`** — weather/ambiance toggle, sends weather event via socket
9. **`client/chat.js`** — chat message list, input/send, username click-to-edit, rename event

## WS Event Reference

| Event (client → server) | Payload |
|---|---|
| `add-song` | `{ url, title }` |
| `skip` | — |
| `weather` | `{ type: rain\|sun\|night }` |
| `chat-msg` | `{ text }` |
| `rename` | `{ name }` |

| Event (server → client) | Payload |
|---|---|
| `state` | full room state on join |
| `song-added` | `{ url, title, addedBy }` |
| `now-playing` | `{ url, title, timestamp }` |
| `weather-changed` | `{ type }` |
| `chat-msg` | `{ user, text, time }` |
| `user-joined` | `{ id, name }` |
| `user-left` | `{ id, name }` |
| `user-renamed` | `{ id, oldName, newName }` |

## Stack

- **Runtime:** Node.js
- **Dependencies:** `express`, `ws`, `uuid`
- **Frontend:** Vanilla HTML/CSS/JS — zero build step
- **Music:** YouTube IFrame API (free, no storage)
- **Hosting:** any Node host (Railway, Render, Fly.io)
