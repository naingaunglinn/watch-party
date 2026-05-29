# Watch Party — System Architecture

## Project Overview

**Watch Party** is a peer-to-peer (P2P) screen sharing web application. A host creates a room, picks what to share (entire screen, window, or browser tab), and sends a link to a viewer. The viewer joins and sees the host's screen in real-time. All video data flows directly browser-to-browser via WebRTC — no server ever touches the video stream. The server only handles lightweight signaling (offer/answer/ICE) and chat messages via HTTP polling backed by Redis.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.6 |
| UI Library | React | 19.2.4 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| State/UI Icons | lucide-react | 1.17.0 |
| Database / PubSub | Upstash Redis (REST) | 1.38.0 |
| Transport | WebRTC (browser native) | — |
| UUID Generation | uuid + crypto.randomUUID | 14.0.0 |

---

## Directory Structure

```
watch-party/
├── app/
│   ├── api/rooms/
│   │   ├── route.ts                  # POST — create room
│   │   └── [id]/
│   │       ├── route.ts              # GET — fetch room
│   │       ├── signal/route.ts       # POST/GET — WebRTC signaling
│   │       └── chat/route.ts         # POST/GET — chat messages
│   ├── room/[id]/page.tsx            # Room session page (host / viewer)
│   ├── page.tsx                      # Landing page
│   ├── layout.tsx                    # Root layout (dark theme, Geist font)
│   └── globals.css                   # Tailwind global styles
├── components/
│   ├── LandingHero.tsx               # Create / join room UI
│   ├── HostView.tsx                  # Screen share controls & status
│   ├── ViewerView.tsx                # Remote stream video player
│   └── ChatPanel.tsx                 # Side-panel chat UI
├── hooks/
│   ├── useWebRTC.ts                  # RTCPeerConnection + getDisplayMedia
│   ├── useSignaling.ts               # Signal polling & sending
│   └── useChat.ts                    # Chat polling & sending
├── lib/
│   ├── types.ts                      # Shared TypeScript interfaces
│   └── redis.ts                      # Upstash Redis client & key helpers
├── public/                           # Static assets
├── next.config.ts
├── tsconfig.json
└── .env.local                        # UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
```

---

## System Architecture

```
┌─────────────────┐         ┌─────────────────┐
│   Host Browser  │◄───────►│  Viewer Browser │
│  (Screen Share) │  WebRTC │  (Watch Stream) │
└────────┬────────┘   P2P   └────────┬────────┘
         │                            │
         │ 1. POST signal             │ 2. GET poll signal
         │ 3. GET poll signal         │ 4. POST signal
         └────────────┬───────────────┘
                      │
           ┌──────────▼──────────┐
           │   Next.js API Routes │
           │  /api/rooms/...      │
           └──────────┬───────────┘
                      │
           ┌──────────▼──────────┐
           │   Upstash Redis     │
           │  room:{id}          │  Hash  (metadata)
           │  room:{id}:signals  │  List  (WebRTC signals)
           │  room:{id}:chat     │  List  (chat messages)
           └─────────────────────┘
```

---

## Frontend Architecture

### Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `LandingHero` | Entry point. Create a room or join with a room ID. |
| `/room/[id]?role=host&uid=` | `RoomPage` + `HostView` | Host controls screen sharing, copies invite link, sees viewer status. |
| `/room/[id]?role=viewer&uid=` | `RoomPage` + `ViewerView` | Viewer watches the remote stream and waits for host. |

### Room Page State Machine

```
[Loading] ──fetch room──► [Error] (404 or 500)
    │
    └───OK───► [Active]
                  ├── role=host → HostView + ChatPanel
                  └── role=viewer → ViewerView + ChatPanel
```

### Custom Hooks

#### `useWebRTC({ role, onSignal })`
Manages the entire WebRTC lifecycle:
- Creates `RTCPeerConnection` with public STUN servers.
- **Host**: calls `navigator.mediaDevices.getDisplayMedia()`, adds tracks to PC, creates an **offer**, sends it via `onSignal`.
- **Viewer**: waits for offer, sets remote description, creates **answer**, sends it back.
- **ICE candidates**: gathered by `onicecandidate`, sent via `onSignal`.
- **Viewer**: receives remote stream via `ontrack`.
- Handles browser-native "Stop Sharing" events.
- Exposes: `startSharing`, `stopSharing`, `handleOffer`, `handleAnswer`, `handleIceCandidate`, `remoteStream`, `connectionState`, `isSharing`.

#### `useSignaling({ roomId, userId, role, enabled, onOffer, onAnswer, onIce })`
- **Sends**: `POST /api/rooms/{id}/signal` with `{ type, from, payload }`.
- **Polls**: `GET /api/rooms/{id}/signal?cursor=` every 1 second.
- Skips signals sent by the same role (host ignores host signals).
- Dispatches `offer`, `answer`, `ice` to `useWebRTC` handlers.
- Uses cursor-based pagination to avoid re-processing old signals.

#### `useChat({ roomId, userName, enabled })`
- **Sends**: `POST /api/rooms/{id}/chat` with `{ from, text }`.
- **Polls**: `GET /api/rooms/{id}/chat?cursor=` every 1 second.
- Appends new messages to local state.
- Exposes: `messages`, `sendMessage`.

### Component Hierarchy

```
RootLayout (dark mode, Geist font)
└── page.tsx
    ├── /            → LandingHero
    └── /room/[id]   → RoomPage (Suspense wrapper)
                         └── RoomPageInner
                               ├── HostView  OR  ViewerView
                               └── ChatPanel
```

---

## Backend / API Architecture

All API routes are **stateless** Edge-compatible handlers. State is stored entirely in Redis.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rooms` | `POST` | Creates a new room. Requires `role=host` query param. Returns `{ roomId, userId }`. |
| `/api/rooms/[id]` | `GET` | Fetches room metadata from Redis hash. Returns `Room` object. |
| `/api/rooms/[id]/signal` | `POST` | Appends a WebRTC signal to `room:{id}:signals` list. |
| `/api/rooms/[id]/signal` | `GET` | Returns signals from cursor onward via `LRANGE`. Returns `{ signals, nextCursor }`. |
| `/api/rooms/[id]/chat` | `POST` | Appends a chat message to `room:{id}:chat` list. |
| `/api/rooms/[id]/chat` | `GET` | Returns chat messages from cursor onward. Returns `{ messages, nextCursor }`. |

**Polling Strategy**: The client polls every **1 second** with a cursor offset. The server uses Redis `LRANGE` to return only new items. This is simple, works behind firewalls, and requires no WebSocket infrastructure.

---

## WebRTC Signaling Flow

```
Host                                         Viewer
  │                                            │
  │ 1. getDisplayMedia() → local stream        │
  │ 2. pc.createOffer()                        │
  │ 3. POST signal {type:"offer"}              │
  │                                            │
  │                       4. GET poll → offer  │
  │                       5. pc.setRemoteDescription(offer)
  │                       6. pc.createAnswer()   │
  │                       7. POST signal {type:"answer"}
  │ 8. GET poll → answer                       │
  │ 9. pc.setRemoteDescription(answer)         │
  │                                            │
  │ 10. onicecandidate → POST {type:"ice"}      │
  │                       11. GET poll → ice   │
  │                       12. pc.addIceCandidate()│
  │                                            │
  │◄══════════════ P2P MEDIA STREAM ══════════►│
```

**ICE Servers**: Only public Google STUN servers are configured. There is **no TURN server**, meaning the connection may fail if both peers are behind symmetric NATs or restrictive firewalls.

---

## Data Model (Redis)

### Key Patterns

| Key Pattern | Type | TTL | Description |
|-------------|------|-----|-------------|
| `room:{id}` | Hash | 24h | Room metadata: `id`, `hostId`, `status`, `createdAt` |
| `room:{id}:signals` | List | 24h | WebRTC signaling messages (JSON strings) |
| `room:{id}:chat` | List | 24h | Chat messages (JSON strings) |

### TypeScript Interfaces

```typescript
interface Room {
  id: string;
  hostId: string;
  status: "waiting" | "live" | "ended";
  createdAt: number;
  viewerId?: string;
}

interface Signal {
  type: "offer" | "answer" | "ice";
  from: "host" | "viewer";
  payload: unknown; // RTCSessionDescriptionInit or RTCIceCandidateInit
  ts: number;
}

interface ChatMessage {
  from: string;
  text: string;
  ts: number;
}
```

---

## State Management

There is **no global state library** (no Redux, Zustand, or Context API for app state). Each page and hook manages its own local React state:

- `useState` for UI state (loading, error, messages, streams).
- `useRef` for mutable values that should not trigger re-renders:
  - `sendSignalRef` — bridges `useWebRTC` callback to `useSignaling`'s latest `sendSignal` function.
  - `cursorRef` — tracks polling cursor without causing re-renders.
  - `abortRef` — cleanly stops polling loops in `useEffect` cleanup.
  - `pcRef`, `localStreamRef` — holds the WebRTC peer connection and media stream.

This keeps the architecture minimal and avoids unnecessary renders.

---

## Security & Privacy Model

| Aspect | Implementation |
|--------|---------------|
| **Video Privacy** | Video never touches the server. Pure browser-to-browser WebRTC. |
| **No Authentication** | No accounts, passwords, or sign-up. Anyone with the room link can join as viewer. |
| **Room Isolation** | Each room has a UUID. No room listing or discovery endpoint. |
| **Role Enforcement** | Only `role=host` can create rooms. Viewers are rejected at creation time. |
| **ICE Filtering** | Peers only accept ICE candidates from the opposite role. |
| **Data TTL** | All Redis keys expire after **24 hours**. Rooms auto-delete. |
| **No HTTPS Enforcement in Code** | Relies on hosting platform (Vercel, etc.) to provide HTTPS, which WebRTC requires. |

**Known Limitations**:
- No TURN server = connection may fail on restrictive networks.
- No rate limiting on signal/chat polling.
- No end-to-end encryption on chat messages (server can read them in Redis).
- Room IDs are UUIDs but the join input allows free-text — this is UI-side validation only.

---

## Deployment Requirements

1. **Node.js environment** capable of running Next.js 16.
2. **Upstash Redis database** (or any Redis compatible with `@upstash/redis` REST client).
3. **HTTPS** is mandatory for `getDisplayMedia()` and WebRTC in modern browsers.
4. Environment variables:
   ```bash
   UPSTASH_REDIS_REST_URL=https://...
   UPSTASH_REDIS_REST_TOKEN=...
   ```

**Recommended Platform**: Vercel (native Next.js support + Upstash Redis integration).

---

## Build & Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Lint
npm run lint
```

---

## Key Design Decisions

1. **HTTP Polling over WebSockets**: Chosen for simplicity, firewall compatibility, and to avoid managing persistent connections or separate socket servers. Redis lists make cursor-based polling efficient.

2. **No TURN Server**: Keeps costs at zero and complexity low. Acceptable for a demo/side-project where both users are likely on standard home networks.

3. **Client-Side Hooks for WebRTC**: All WebRTC logic lives in `useWebRTC.ts`, making it framework-agnostic and easy to test or extract.

4. **Role-Based URL Params**: `?role=host|viewer&uid=` in the URL makes the application stateless and shareable. The host simply shares their browser URL.

5. **Ref-Based Callback Bridging**: `useWebRTC` receives `onSignal` at initialization, but the actual `sendSignal` function from `useSignaling` is wired via a `useRef` to avoid re-creating the peer connection on every render.

---

## Future Extension Points

- **Add a TURN server** (e.g., Twilio, Cloudflare) for NAT traversal reliability.
- **WebSocket upgrade** for lower-latency signaling and chat.
- **Room password / PIN** for basic access control.
- **Multi-viewer support**: currently 1-to-1; would require SFU/MCU or mesh topology.
- **Viewer request to host**: e.g., "knock to join" flow.
- **Message reactions / typing indicators** in chat.
- **Screen recording** on the viewer side.
