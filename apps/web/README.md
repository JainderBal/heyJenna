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
  app/        App.tsx (routes) · useEditorStore.ts (page, selection, side panel tabs, toast)
  home/       Home.tsx · HomeCarousel.tsx (stub: plain row)
  jenna/      JennaCube.tsx (stub: static face)
  editor/     Editor shell, Canvas (pan/zoom/focus), LeftPanel, Rail, Dock, Toast, model.ts (pages + frames), frames/
  viewer/     RoomViewer.tsx (stub)
  sidepanel/  SidePanel.tsx · PinterestPanel.tsx / ChatPanel.tsx / ShopPreview.tsx (stubs)
  styles/     studio.css (ported from the prototype)
```

Routes: `/` home, `/p/:projectId?page=plan|<roomId>&sel=<frameId>`.

Request types come from `@hey-jenna/contracts` (resolved from its `src/` via `tsconfig` paths, type-only
imports, so the package needn't be built first). Response types are mirrored by hand in `src/api/types.ts`.
