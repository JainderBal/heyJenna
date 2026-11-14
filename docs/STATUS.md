# Status and handoff

Read this before picking up work (person or agent). Last updated 2026-11-14. For how the parts fit together, see `docs/how-it-works.md`.

## What hey jenna does

A moodboard plus a floor plan → every room laid out in 3D with real, buyable furniture
(second-hand first, IKEA with real 3D models), and a shopping list with links and prices.

## Built and on `main`

**Studio web app (`apps/web`)**, a React port of the studio prototype:
- Home: WebGL curved project carousel, 3D jenna, "+" new project.
- Editor: Floor plan page + one page per room, each with layers (Moodboard, Palette, 3D room, Shopping list); Figma-like pan, zoom and focus.
- Floor plan: read a plan photo (needs `ANTHROPIC_API_KEY`), or draw rooms / use the sample plan; isometric 3D floor plan of the whole home.
- Moodboard: upload images, drag or paste pins from Pinterest (a separate window on the web, a side panel tab in the desktop app), remove an image. Pasting or dropping image files adds them to the board (`?append=1`); "Replace board" starts it again.
- Find products → Lay out the room → live 360° 3D room with real IKEA models → Render (Blender) → the rendered room as a 360° 3D model (Render 3D / Live / Re-render).
- Side panel tabs: jenna chat, live shopping list (photos, prices, seller links, 3D badge, "not for sale" built-ins and props), Style (the room's 55 dials by section: sliders, selects, chips, a measured / preset / edited hint, reset per dial and all, filter; saved with a debounced `PATCH /rooms/:roomId/style`).
- Edit furniture in the live 3D room: click a piece to pick it, drag it over the floor (5 cm snap), turn it (±15°, 90°, R / Shift+R), remove it (button or Delete). Saved through `PATCH/DELETE …/layouts/:layoutId/objects/:objectId`; the API's refusals and warnings show in the viewer. Live mode only.
- Swap a product: "Swap" on each shopping-list piece (frame and side panel) lists the room's other listings of the same type, or takes a pasted product link as a candidate (`PATCH …/objects/:objectId {listingId}`).

**Desktop app (`apps/desktop`)**: Electron shell for Mac: the studio, with pinterest.com as a side panel tab (persistent login, "+ Add to moodboard" on pins), unsigned `.dmg` via `npm run dist -w @hey-jenna/desktop`.

**API (`apps/api`)**: projects and rooms, floor plan from a photo, moodboard (uploads, with `?append=1` to add to the board, and pins) → style + 55 style dials (the profile keeps the derived values for reset), sourcing (IKEA, eBay, Etsy, Brave web search for Kijiji / FB Marketplace, pasted links), layout engine (Python) with edits, shopping list, render jobs + Blender worker, jenna chat (Claude tool use, rules without a key), live room events (SSE), background jobs, IKEA 3D model proxy with cache, CORS.

Style dials: shape dials steer sourcing, materials/lighting/palette dials steer renders. See `docs/style-dials.md`.

## Not built yet (roughly in priority order)

3. **Save room positions on the plan** in the API (today they're in the browser's localStorage).
4. **Layout and props style dials** (symmetry, furniture float, rug shape, curtains, art and textile amounts…): unfinished work on branch `feat/dials-layout` (all tests pass, not reviewed).
7. **Login** with Supabase (`AUTH_MODE=supabase`) and the web app sending the user's token instead of `x-dev-user`.
8. **Production config for the web app:** an API URL setting or a host rewrite of `/api` (see `docs/production-setup.md`).
10. Share, Assets, Sellers and Styles on the left rail ("coming soon"); phone and tablet layouts; the landing page as part of the app.

Not checked with real keys yet: Claude chat and floor-plan reading, Etsy, eBay, Brave.

## How we work

- **Branches and PRs:** every change goes on a feature branch and a PR into `main`. Agents work in their own git worktree (`git worktree add -b feat/x ~/repos/hey-jenna-x origin/main`) so parallel work doesn't collide.
- **Before merging:** `npm test` (API, ~170 tests), `npx tsc -p apps/api --noEmit`, `npx tsc -p apps/web --noEmit`, `npm run build -w @hey-jenna/web`. New migrations: apply them to a scratch database and check `prisma migrate diff` shows no drift.
- **After pulling:** `npm install`, `npm run build -w @hey-jenna/contracts`, `cd apps/api && npx prisma generate && npx prisma migrate deploy`.
- **Contracts:** request and response shapes live in `packages/contracts` (zod). The web app mirrors some response types by hand in `apps/web/src/api/types.ts`; move them into contracts when you touch them.
- **No scraping:** sources use official APIs, IKEA's own public search, or search-engine results.
- **Keys:** never commit them. `.env` files are gitignored.
