# Status and handoff

Read this before picking up work (person or agent). Last updated 2026-11-13.

## What hey jenna does

A moodboard plus a floor plan → every room laid out in 3D with real, buyable furniture
(second-hand first, IKEA with real 3D models), and a shopping list with links and prices.

## Built and on `main`

**Studio web app (`apps/web`)**, a React port of the studio prototype:
- Home: WebGL curved project carousel, 3D jenna, "+" new project.
- Editor: Floor plan page + one page per room, each with layers (Moodboard, Palette, 3D room, Shopping list); Figma-like pan, zoom and focus.
- Floor plan: read a plan photo (needs `ANTHROPIC_API_KEY`), or draw rooms / use the sample plan.
- Moodboard: upload images, drag or paste pins from the docked Pinterest window, remove an image.
- Find products → Lay out the room → live 360° 3D room with real IKEA models → Render (Blender; shown as a thumbnail, the live 3D keeps spinning).
- Side panel tabs: jenna chat, live shopping list (photos, prices, seller links, 3D badge, "not for sale" built-ins and props).

**API (`apps/api`)**: projects and rooms, floor plan from a photo, moodboard (uploads and pins) → style + 55 style dials, sourcing (IKEA, eBay, Etsy, Brave web search for Kijiji / FB Marketplace, pasted links), layout engine (Python) with edits, shopping list, render jobs + Blender worker, jenna chat (Claude tool use, rules without a key), live room events (SSE), background jobs, IKEA 3D model proxy with cache, CORS.

Style dials: shape dials steer sourcing, materials/lighting/palette dials steer renders. See `docs/style-dials.md`.

## Not built yet (roughly in priority order)

1. **Edit furniture in the 3D room:** move, rotate, swap a product, remove. The API supports all of it (`PATCH/POST /rooms/:roomId/layouts/:layoutId/objects`); the UI doesn't.
2. **Swap a product** from the search results in the shopping list.
3. **3D view of the whole floor plan** (the prototype's "3D floor plan" frame).
4. **Save room positions on the plan** in the API (today they're in the browser's localStorage).
5. **Layout and props style dials** (symmetry, furniture float, rug shape, curtains, art and textile amounts…): unfinished work on branch `feat/dials-layout` (all tests pass, not reviewed).
6. **Style dial editing UI** (the API already accepts `PATCH /rooms/:roomId/style`).
7. **Paste an image file without replacing the board:** the upload endpoint replaces the moodboard; add an "append" option.
8. **Login** with Supabase (`AUTH_MODE=supabase`) and the web app sending the user's token instead of `x-dev-user`.
9. **Production config for the web app:** an API URL setting or a host rewrite of `/api` (see `docs/production-setup.md`).
10. Share, Assets, Sellers and Styles on the left rail ("coming soon"); phone and tablet layouts; the landing page as part of the app.

Not checked with real keys yet: Claude chat and floor-plan reading, Etsy, eBay, Brave.

## How we work

- **Branches and PRs:** every change goes on a feature branch and a PR into `main`. Agents work in their own git worktree (`git worktree add -b feat/x ~/repos/hey-jenna-x origin/main`) so parallel work doesn't collide.
- **Before merging:** `npm test` (API, ~170 tests), `npx tsc -p apps/api --noEmit`, `npx tsc -p apps/web --noEmit`, `npm run build -w @hey-jenna/web`. New migrations: apply them to a scratch database and check `prisma migrate diff` shows no drift.
- **After pulling:** `npm install`, `npm run build -w @hey-jenna/contracts`, `cd apps/api && npx prisma generate && npx prisma migrate deploy`.
- **Contracts:** request and response shapes live in `packages/contracts` (zod). The web app mirrors some response types by hand in `apps/web/src/api/types.ts`; move them into contracts when you touch them.
- **No scraping:** sources use official APIs, IKEA's own public search, or search-engine results.
- **Keys:** never commit them. `.env` files are gitignored.
