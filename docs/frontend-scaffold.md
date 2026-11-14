# Frontend scaffold (apps/web) — React

The plan for the hey jenna app, built in **React** on top of the backend in `apps/api`.
Design source: the **room studio** artifact (three.js room, presets, moodboard → palette), the **glass chat**
frames, the **app UI** prototype (3 screens) and the landing page's brand (`STYLE.md`).

## Stack

| Need | Choice |
|---|---|
| App | **React + TypeScript, built with Vite** (single-page app) |
| Pages | **React Router**: `/`, `/login`, `/home`, `/rooms/:id/canvas`, `/rooms/:id/room` |
| 3D room | **three.js via @react-three/fiber + @react-three/drei** (`useGLTF` loads the IKEA models) |
| Server data | **TanStack Query** (caching, refetch, optimistic moves/swaps) |
| UI state | **Zustand** (selected piece, open panels, camera) |
| Login | **@supabase/supabase-js** (the API already checks Supabase tokens) |
| Live updates | **EventSource (SSE)** |
| Styling | **CSS modules + design tokens** (liquid glass, sky, Cooper "hey jenna") |
| Shared types | **@hey-jenna/contracts** |

## Folders

```
apps/web/
├── index.html · vite.config.ts
├── src/
│   ├── main.tsx                 React root: Router, QueryClient, auth provider
│   ├── routes/                  thin pages that compose features: Home, Login, Canvas, Room
│   ├── features/                one folder per feature (like the backend modules)
│   │   ├── rooms/      RoomCard, NewRoomDialog, FloorPlanEditor
│   │   ├── moodboard/  Canvas (pan/zoom), UploadDrop, PalettePanel, DialsPanel
│   │   ├── chat/       GlassChat, PromptBar, MessageList, VoiceButton
│   │   ├── room3d/     RoomScene, Shell, Piece (IKEA GLB or stand-in), WallPiece, Lights,
│   │   │               CameraRig, BuildAnimation, DragControls  (+ scene/ for pure 3D maths)
│   │   ├── listings/   ListingsSidebar, ListingCard, ShoppingTotal, SwapSheet
│   │   └── jenna/      JennaBlob, JennaCursor
│   ├── components/ui/           generic: GlassPanel, Button, Pill, Tabs, Sheet, Dialog, Spinner, Toast, Slider
│   ├── components/layout/       AppShell, TopBar, PromptBar
│   ├── lib/                     http.ts, supabase.ts, events.ts (SSE), units.ts (metres ⇄ three.js), format.ts
│   ├── stores/                  Zustand: roomUi.ts, canvasUi.ts
│   └── styles/                  tokens.css, globals.css
└── public/                      fonts, brand images
```

## Layers inside every feature

```
 components/   UI only: props in, events out                  (never fetches)
 containers/   connect UI to data: call hooks, pass props down
 hooks/        data logic: TanStack Query queries/mutations, cache keys, optimistic updates
 mappers.ts    API shape → UI shape
 api.ts        the ONLY place that talks to the backend for this feature
 lib/http.ts   shared fetch client: base URL, Supabase token, typed errors
```

Rules:
- Components never import `api.ts` or hooks; only containers use hooks; only hooks call `api.ts`.
- Features use each other only through their `index.ts`.
- Anything used by two or more features goes in `src/components/ui/`, `src/components/layout/` or `src/lib/`.

### Example feature: `listings`

```
src/features/listings/
├── index.ts                         public exports
├── types.ts                         UI types (Listing, ShoppingItem)
├── api.ts                           listingsApi.list / search / pick / shoppingList
├── mappers.ts                       toListing(dto) → Listing (title, variant, price text, source label, has3d, match %)
├── queryKeys.ts                     listingKeys.all / byType / shopping
├── hooks/
│   ├── useListings.ts               read
│   ├── useShoppingList.ts           read
│   ├── useSearchListings.ts         write
│   └── usePickListing.ts            write, optimistic (tick instantly, undo on error)
├── containers/
│   ├── ListingsSidebarContainer.tsx wires hooks + roomUi store → ListingsSidebar
│   └── SwapSheetContainer.tsx
├── components/
│   ├── ListingsSidebar.tsx (+ .module.css)
│   ├── ListingCard.tsx (+ .module.css)
│   ├── ShoppingTotal.tsx
│   ├── SwapSheet.tsx
│   └── EmptyState.tsx
└── __tests__/  mappers.test.ts · ListingCard.test.tsx
```

```ts
// lib/http.ts — shared by every feature
export async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}),
      ...init.headers,
    },
  });
  const body = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new ApiError(res.status, body?.message ?? res.statusText, body?.problems);
  return body as T;
}

// features/listings/api.ts — talks to the backend, nothing else
export const listingsApi = {
  list: (roomId: string, type?: string) => http<ListingDto[]>(`/rooms/${roomId}/listings${type ? `?type=${type}` : ''}`),
  pick: (roomId: string, id: string, picked: boolean) =>
    http<ListingDto>(`/rooms/${roomId}/listings/${id}`, { method: 'PATCH', body: JSON.stringify({ picked }) }),
  shoppingList: (roomId: string, layoutId: string) => http<ShoppingListDto>(`/rooms/${roomId}/layouts/${layoutId}/shopping-list`),
};

// features/listings/hooks/useListings.ts — data logic
export const useListings = (roomId: string, type?: string) =>
  useQuery({ queryKey: listingKeys.byType(roomId, type), queryFn: async () => (await listingsApi.list(roomId, type)).map(toListing) });

// features/listings/containers/ListingsSidebarContainer.tsx — wires data to UI
export function ListingsSidebarContainer({ roomId, layoutId }: { roomId: string; layoutId: string }) {
  const { tab, setTab, sidebarOpen, toggleSidebar } = useRoomUi();
  const listings = useListings(roomId, tab === 'all' ? undefined : tab);
  const shopping = useShoppingList(roomId, layoutId);
  const pick = usePickListing(roomId);
  return <ListingsSidebar open={sidebarOpen} onToggle={toggleSidebar} tab={tab} onTabChange={setTab}
    listings={listings.data ?? []} loading={listings.isLoading} total={shopping.data?.total}
    missing={shopping.data?.missing ?? []} onPick={(id, picked) => pick.mutate({ id, picked })} />;
}

// routes/RoomPage.tsx — pages only compose features
export function RoomPage() {
  const { roomId = '' } = useParams();
  const layout = useLatestLayout(roomId);
  if (!layout.data) return null;
  return (<>
    <RoomSceneContainer roomId={roomId} layoutId={layout.data.id} />
    <ListingsSidebarContainer roomId={roomId} layoutId={layout.data.id} />
    <JennaBlob />
  </>);
}
```

`room3d` follows the same pattern: hooks `useLatestLayout`, `useMovePiece`, `useSwapPiece`, `useAddPiece`;
container `RoomSceneContainer`; components `RoomScene`, `Shell`, `Piece`, `WallPiece`, `Lights`, `CameraRig`,
`BuildAnimation`, `DragControls`; and `scene/` for pure 3D maths (placing a GLB on its footprint, metres → world).

## Screens → backend calls

| Screen | Calls |
|---|---|
| **Home** | `GET /rooms`, `POST /rooms` |
| **Canvas** | `POST /rooms/:id/moodboard`, `GET/PATCH /rooms/:id/style` |
| **Room (3D)** | `POST …/listings/search`, `POST/GET …/layouts`, `PATCH/POST/DELETE …/objects`, `GET …/shopping-list`, `POST …/renders` |

## The 3D room

Drawn in the browser from the layout JSON (positions in metres, rotations, sizes) plus each product's IKEA
3D model, placed the same way the Blender renderer does (centred on its footprint, on the floor; wall pieces
centred on their height, back to the wall). Moves and swaps are instant and saved through the API; Blender
is only for the final picture.

## Build order (one PR each)

1. Scaffold: Vite + React, tokens, `components/ui`, `lib/http`, Supabase login, Home.
2. Room (3D) + listings sidebar.
3. Editing in 3D (select, drag, rotate, swap, add, remove).
4. Canvas (moodboard, palette; later dials and Pinterest items).
5. Chat (glass UI; wired to the AI orchestrator once it exists).
6. Polish: build animation, jenna blob and cursor.

## Backend still needed for the UI

- SSE events endpoint (`GET /rooms/:id/events`).
- An endpoint serving IKEA 3D models through our API (cached).
- CORS for the web app's origin; real Supabase auth settings.
- Later: moodboard items (Pinterest), the 55 dials, the AI orchestrator.
