# Frontend scaffold (apps/web)

The plan for the hey jenna app, built in React on top of the backend in `apps/api`.
Design source: the **room studio** artifact (three.js room, retro / modern / garden presets,
moodboard → palette), the **glass chat** frames, the **app UI** prototype (3 screens) and the
landing page's brand (`STYLE.md`: cloud sky, Cooper "hey jenna" with red shadow, warm photos).

## Stack

| Need | Choice | Why |
|---|---|---|
| App framework | **Next.js (App Router) + TypeScript** | landing page + app in one, routing, deploys anywhere |
| 3D room | **three.js via @react-three/fiber + @react-three/drei** | React-friendly three.js; `useGLTF` loads the IKEA models; the room studio's look ports over |
| Server data | **TanStack Query** | caching, refetch, optimistic edits (move/swap) |
| UI state | **Zustand** | selected piece, open panels, camera, chat draft |
| Login | **@supabase/supabase-js** | the backend already verifies Supabase tokens |
| Live updates | **EventSource (SSE)** | render progress, "jenna noticed…" (backend endpoint still to build) |
| Styling | **CSS modules + design tokens** (`styles/tokens.css`) | the liquid-glass and sky styles are custom; no utility framework needed |
| Shared types | **`@hey-jenna/contracts`** | the same zod shapes the API uses (FloorPlan, StyleProfile, Listing…) |

## Folders

```
apps/web/
├── app/                              routes (thin: load data, render a feature screen)
│   ├── layout.tsx                    fonts, tokens, QueryClient + auth providers
│   ├── page.tsx                      landing page (from panel-6/site)
│   ├── login/page.tsx                Supabase sign-in
│   ├── home/page.tsx                 all rooms (project cards) + bottom glass prompt bar
│   ├── rooms/[roomId]/canvas/page.tsx   moodboard canvas + chat
│   └── rooms/[roomId]/room/page.tsx     3D room + listings sidebar + jenna blob
│
├── features/                         one folder per feature, same idea as the backend modules
│   ├── rooms/          RoomCard, NewRoomDialog, FloorPlanEditor (draw walls, windows, doors)
│   ├── moodboard/      Canvas (pan/zoom), MoodboardItem, UploadDrop, PalettePanel, DialsPanel
│   ├── chat/           GlassChat, PromptBar, MessageList, VoiceButton
│   ├── room3d/         RoomScene, Shell (walls/floor/openings), Piece (IKEA GLB or stand-in),
│   │                   WallPiece, Lights, CameraRig, BuildAnimation (plan → 3D), DragControls
│   ├── listings/       ListingsSidebar, ListingCard, ShoppingList, SwapSheet
│   └── jenna/          JennaBlob (idle animation), JennaCursor (points at things, Hey Clicky style)
│
│   each feature has:  components/ · hooks/ (useLayout, useMovePiece…) · api.ts · types.ts
│
├── components/ui/                    shared building blocks: GlassPanel, Pill, Tabs, Button, Sheet, Toast
├── lib/
│   ├── api/client.ts                 fetch wrapper: base URL, Supabase token, typed errors
│   ├── api/endpoints.ts              one function per backend endpoint (rooms, style, listings, layouts, renders)
│   ├── supabase.ts                   browser client
│   ├── events.ts                     SSE subscription per room
│   └── units.ts                      plan metres ⇄ three.js world (x, z flipped like the renderer)
├── stores/                           Zustand: selection, panels, camera
├── styles/                           tokens.css (colours, glass, radii, type), globals.css
└── public/                           fonts, brand images
```

## Screens → backend calls

| Screen | Shows | Calls |
|---|---|---|
| **Home** | room cards, "hey jenna" prompt bar | `GET /rooms`, `POST /rooms` |
| **Canvas** | moodboard (pan/zoom), palette, dials, chat | `POST /rooms/:id/moodboard`, `GET/PATCH /rooms/:id/style`, later moodboard items |
| **Room (3D)** | the room in three.js, listings sidebar, shopping total | `POST /rooms/:id/listings/search`, `POST/GET /rooms/:id/layouts`, `PATCH/POST/DELETE …/objects`, `GET …/shopping-list`, `POST …/renders` |

## How the 3D room is drawn (no Blender needed for editing)

- The layout JSON already has every piece's position (plan metres), rotation, size and, for real
  products, `product.modelUrl` (IKEA GLB). The viewer draws the shell from the floor plan and loads
  each GLB with `useGLTF`, placed exactly as the renderer does: centred on its footprint, standing on
  the floor (wall pieces centred on their height, back to the wall); stand-in shapes otherwise.
- Edits are instant in the browser (drag, rotate, swap), then saved with `PATCH …/objects/:id`.
  Blender renders stay for the final "beauty" picture.
- IKEA GLBs: load through a small API proxy/cache endpoint (to add) rather than straight from IKEA.

## Build order (each a PR)

1. Scaffold: Next.js app, tokens, glass components, API client, Supabase login, Home screen.
2. Room (3D): `RoomScene` from the room-studio artifact + layout JSON + GLB loading; listings sidebar.
3. Editing in 3D: select, drag, rotate, swap, add/remove, saved through the API.
4. Canvas: moodboard upload, palette, (later) dials and Pinterest items.
5. Chat: glass chat UI; wired to the AI orchestrator once that exists.
6. Polish: build animation, jenna blob and cursor, landing page.

## Still needed in the backend for the UI

- SSE events endpoint (`GET /rooms/:id/events`).
- 3D model proxy/cache endpoint for IKEA GLBs.
- CORS for the web origin (and real Supabase auth in `.env`).
- Later: moodboard items (Pinterest), the 55 dials, the AI orchestrator.
