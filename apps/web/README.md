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

## Settings (build time)

Vite reads these from `apps/web/.env.local` (or your web host's build settings); see
[`.env.example`](.env.example). They end up in the browser bundle, so never put secrets in them.

| Var | Default | What |
|---|---|---|
| `VITE_API_URL` | `/api` | The API's base URL, e.g. `https://api.heyjenna.app`. Every API call, the live-updates stream (SSE), moodboard images and 3D models use it (`src/api/client.ts` `apiBase()` / `apiUrl()`). Leave it unset in dev (the Vite proxy) and for the desktop app (it forwards `/api/*` itself). When it points at another origin, add the web app's URL to the API's `CORS_ORIGINS`. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | unset | Login with Supabase. Unset (local dev): no login screen, calls send `x-dev-user` (the API's `AUTH_MODE=dev`). Both set (with the API on `AUTH_MODE=supabase`): a sign-in screen (email magic link, Google), the session is kept by supabase-js, and every call sends `Authorization: Bearer <access token>`; the SSE stream and moodboard `<img>`s send `?access_token=` (the API reads it on those two routes only). Sign out from the avatar on the home page. |

## Login (Supabase)

`src/app/auth/`: `AuthGate.tsx` (sign-in screen until there is a session; clears the query cache when
the user changes), `SignIn.tsx`, `AccountMenu.tsx` (avatar → email, Sign out), `session.ts`
(supabase-js, loaded on demand so the dev build never downloads it). `src/api/auth.ts` holds the
current token and builds the login headers. In the Supabase dashboard: enable the Email and Google
providers (Google needs an OAuth client from Google Cloud) and add the web app's URL to
Authentication → URL Configuration (Site URL and Redirect URLs), since the magic link and Google
send the user back to the page they signed in from.

```bash
npm test -w @hey-jenna/web     # vitest: API base, login headers, the Supabase session (with a fake client)
```

```bash
npm run build -w @hey-jenna/web     # type-check + production build into apps/web/dist
npx tsc -p apps/web --noEmit        # type-check only
```

## Layout

```
src/
  api/        client.ts (fetch + ApiError, VITE_API_URL) · auth.ts (login headers) · hooks.ts (react-query) · events.ts (SSE → invalidation) · types.ts (API response shapes)
  app/        App.tsx (routes) · auth/ (Supabase sign-in) · useEditorStore.ts (page, selection, side panel tabs, toast) · openPinterest.ts
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
