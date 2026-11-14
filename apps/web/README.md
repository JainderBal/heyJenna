# web

The hey jenna studio: a Figma-like editor where a project has a **Floor plan** page and one page per
room (Moodboard, Palette, 3D room, Shopping list). Vite + React 18 + TypeScript, react-router,
@tanstack/react-query, zustand, three.

## Run it

From the repo root:

```bash
npm install
npm run db:up        # local Postgres
npm run dev          # API on http://localhost:3000 (AUTH_MODE=dev: no login, user "dev-user")
npm run web          # this app on http://localhost:5173
```

Vite proxies `/api/*` to `http://localhost:3000` (prefix stripped), so there is no CORS in dev.
To act as another dev user, set `localStorage['hj-dev-user']` in the browser.

```bash
npm run build -w @hey-jenna/web     # type-check + production build into apps/web/dist
npx tsc -p apps/web --noEmit        # type-check only
```

## Layout

```
src/
  api/        client.ts (fetch + ApiError) · hooks.ts (react-query) · events.ts (SSE → invalidation) · types.ts (API response shapes)
  app/        App.tsx (routes) · useEditorStore.ts (page, selection, side panel tabs, toast) · openPinterest.ts
  home/       Home.tsx · HomeCarousel.tsx + carousel3d.ts (WebGL curved carousel) · plusCard.ts (animated + card)
  jenna/      JennaCube.tsx + jenna3d.ts (the 3D terrazzo jenna)
  editor/     Editor shell, Canvas (pan/zoom/focus), LeftPanel, Rail, Dock, Toast, model.ts (pages + frames),
              useMoodboardPaste.ts, frames/ (FloorPlanFrames, RoomFrames)
  viewer/     RoomViewer.tsx + viewer3d.ts (live 360° room) · models.ts (real IKEA GLBs via /api) · pieces.ts (clay stand-ins)
  sidepanel/  SidePanel.tsx (tabs) · ChatPanel.tsx (jenna) · ShopPreview.tsx (live shopping list)
  styles/     studio.css (ported from the prototype)
```

**Pinterest:** there is no Pinterest API. The rail button and the Moodboard frame's "Open Pinterest"
open pinterest.com in a window docked beside the studio; users drag a pin onto a moodboard, or copy
its image and press ⌘V on a room page. Pin images (`i.pinimg.com`) go to
`POST /rooms/:roomId/moodboard/pins`, which adds them without replacing the board. Pasting or dropping an image
*file* goes through the upload endpoint with `?append=1`, which adds it to the board; only the frame's
"Replace board" button starts the board again.

Routes: `/` home, `/p/:projectId?page=plan|<roomId>&sel=<frameId>`.

Request types come from `@hey-jenna/contracts` (resolved from its `src/` via `tsconfig` paths, type-only
imports, so the package needn't be built first). Response types are mirrored by hand in `src/api/types.ts`.
