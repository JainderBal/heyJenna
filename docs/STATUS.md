# Status and handoff

Read this before picking up work (person or agent). Last updated 2026-11-14. For how the parts fit together, see `docs/how-it-works.md`.

## What hey jenna does

A moodboard plus a floor plan → every room laid out in 3D with real, buyable furniture
(second-hand first, IKEA with real 3D models), and a shopping list with links and prices.

## Built and on `main`

**Studio web app (`apps/web`)**, a React port of the studio prototype:
- Home: WebGL curved project carousel, 3D jenna, "+" new project.
- Editor: Floor plan page + one page per room, each with layers (Moodboard, Palette, 3D room, Shopping list); Figma-like pan, zoom and focus.
- Floor plan: read a plan photo (needs `ANTHROPIC_API_KEY`), or draw rooms / use the sample plan; isometric 3D floor plan of the whole home. The reader handles real plans (feet and inches or metric, French or bilingual labels, dimension arrows, plans drawn sideways): every space becomes a room with a kind (bedroom, closet, laundry, balcony…), open-plan sides become open walls, and rooms jenna can't furnish yet stay on the plan only (no page). Tested on two plans in `apps/api/test/fixtures/floor-plans/`.
- Moodboard: upload images, drag or paste pins from Pinterest (a separate window on the web, a side panel tab in the desktop app), remove an image. Pasting or dropping image files adds them to the board (`?append=1`); "Replace board" starts it again.
- Find products → Lay out the room → live 360° 3D room with real IKEA models → Render (Blender) → the rendered room as a 360° 3D model (Render 3D / Live / Re-render).
- Side panel tabs: jenna chat, live shopping list (photos, prices, seller links, 3D badge, "not for sale" built-ins and props), Style (the room's 55 dials by section: sliders, selects, chips, a measured / preset / edited hint, reset per dial and all, filter; saved with a debounced `PATCH /rooms/:roomId/style`).
- Edit furniture in the live 3D room: click a piece to pick it, drag it over the floor (5 cm snap), turn it (±15°, 90°, R / Shift+R), remove it (button or Delete). Saved through `PATCH/DELETE …/layouts/:layoutId/objects/:objectId`; the API's refusals and warnings show in the viewer. Live mode only.
- Swap a product: "Swap" on each shopping-list piece (frame and side panel) lists the room's other listings of the same type, or takes a pasted product link as a candidate (`PATCH …/objects/:objectId {listingId}`).
- Room positions on the plan are saved in the API (`planPosition`); drag a room on the Plan frame to move it. Positions an older studio kept in localStorage move to the API once.
- Login with Supabase when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set: sign-in screen (email magic link, Google), Bearer token on every API call, sign out from the home avatar. Unset (local dev), nothing changes: no login, `x-dev-user`. Not tried against a real Supabase project yet.
- Production API URL: `VITE_API_URL` (default `/api`, the dev proxy). See `apps/web/.env.example`.
- Left rail project pages (`?view=` on the editor URL): **Share** (read-only summary of rooms, palettes and shopping lists; copy link, shopping list CSV, print / save as PDF; no public share links yet), **Assets** (every moodboard image, filter by room, open, remove), **Sellers** (chosen products grouped by IKEA / eBay / Etsy / Kijiji-Marketplace / links, with totals and outbound links), **Styles** (each room's palette, style name and key dials side by side).
- Phone (≤600px) and tablet (≤900px) layouts: rail and pages/layers as a drawer, side panel as a bottom sheet on phones, one-finger pan and pinch zoom on the canvas, bigger touch targets. On desktop the left panel's collapse button now works (File on the rail brings it back).
- Landing page at `/` (hero, how it works, the live 3D room, "Start a project"); the project carousel moved to `/projects` (`/home` and `/projects/:id` redirect). The desktop app opens on `/projects`.

**Desktop app (`apps/desktop`)**: Electron shell for Mac: the studio, with pinterest.com as a side panel tab (persistent login, "+ Add to moodboard" on pins), unsigned `.dmg` via `npm run dist -w @hey-jenna/desktop`.

**API (`apps/api`)**: projects and rooms (with their position on the plan), floor plan from a photo, moodboard (uploads, with `?append=1` to add to the board, and pins) → style + 55 style dials (the profile keeps the derived values for reset), sourcing (IKEA, eBay, Etsy, Brave web search for Kijiji / FB Marketplace, pasted links), layout engine (Python) with edits, shopping list, render jobs + Blender worker, jenna chat (Claude tool use, rules without a key), live room events (SSE), background jobs, IKEA 3D model proxy with cache, CORS.

Style dials: shape dials steer sourcing, materials/lighting/palette dials steer renders, layout and props dials steer the layout engine (symmetry, furniture float, focal point, rug shape, curtains, cushions and throw, patterns, statement piece, art amount and mix; at the default values the room comes out as before). See `docs/style-dials.md`.

## Not built yet (roughly in priority order)

0. **Furnish more than living rooms.** The layout engine only knows living-room and office furniture (sofa group, desk, shelves). Bedrooms, dining rooms, kitchens and bathrooms are plan-only until it learns beds, nightstands, dressers, dining tables and chairs (`FURNISHABLE_KINDS` in contracts). Then: a floor-plan review screen (detected rooms drawn over the upload, editable).
1. **Login in the desktop app:** the magic link and Google return to a web URL, not the app's `hj://studio/` page.

Not checked with real keys yet: Claude chat, Etsy, eBay, Brave, Supabase login. Floor-plan reading is checked with a real key (Claude Opus 5.5; Sonnet and Haiku read sizes as well but place rooms worse). `apps/api/scripts/read-plan.ts <image> [model]` reads a plan from the command line.

## How we work

- **Branches and PRs:** every change goes on a feature branch and a PR into `main`. Agents work in their own git worktree (`git worktree add -b feat/x ~/repos/hey-jenna-x origin/main`) so parallel work doesn't collide.
- **Before merging:** `npm test` (API ~210 tests with jest, web with vitest), `npx tsc -p apps/api --noEmit`, `npx tsc -p apps/web --noEmit`, `npm run build -w @hey-jenna/web`. New migrations: apply them to a scratch database and check `prisma migrate diff` shows no drift.
- **After pulling:** `npm install`, `npm run build -w @hey-jenna/contracts`, `cd apps/api && npx prisma generate && npx prisma migrate deploy`.
- **Contracts:** request and response shapes live in `packages/contracts` (zod). The web app mirrors some response types by hand in `apps/web/src/api/types.ts`; move them into contracts when you touch them.
- **No scraping:** sources use official APIs, IKEA's own public search, or search-engine results.
- **Keys:** never commit them. `.env` files are gitignored.
