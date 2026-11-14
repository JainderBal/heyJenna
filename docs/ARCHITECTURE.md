# Architecture: the repo map

Every folder, what it does and how it is built, then the patterns that tie them together. For the
product story read [`how-it-works.md`](how-it-works.md); for running it and the endpoint list, the root
[`README.md`](../README.md); for what's built and how we work, [`STATUS.md`](STATUS.md). This page
doesn't repeat those.

## Top level

| Path | What | Built with |
|---|---|---|
| `apps/api` | The backend: rooms, moodboards, sourcing, layouts, renders, chat, live events | NestJS 11, Prisma 6, zod, TypeScript |
| `apps/web` | The studio (home carousel + Figma-like editor) | Vite 6, React 18, react-query 5, zustand, three.js |
| `apps/desktop` | Mac shell around the studio, Pinterest in the side panel | Electron 45, esbuild, electron-builder |
| `engines/layout` | The interior-design layout engine | Python 3, standard library only |
| `workers/render` | Polls render jobs, builds the room in Blender, uploads PNG + GLB | Python 3 (stdlib) + Blender 4.2 |
| `packages/contracts` | Request/shared schemas used by API and web | zod, built with `tsc` to `dist/` |
| `tools` | Dev scripts that drive a running local API | Node ESM scripts |
| `docs` | How it works, status, production setup, style dials, this page | Markdown |
| `docker-compose.yml` | Local Postgres 16 on port 54329 (stand-in for Supabase) | Docker |
| `package.json` | npm workspaces (`packages/*`, `apps/*`) and the root scripts | npm |

`engines/` and `workers/` are not npm workspaces: the API calls the engine as a child process, and the
worker talks to the API over HTTP.

## apps/api

Entry: `src/main.ts` (CORS from `CORS_ORIGINS`, shutdown hooks) → `src/app.module.ts` (imports every
module below) + `src/health.controller.ts` (`GET /health`, public, runs `SELECT 1`).

### The common layer (`src/common`)

| Folder | What it provides |
|---|---|
| `config/` | `env.ts`: one zod schema for every env var (empty string = unset), cross-checks for `AUTH_MODE` / `STORAGE_DRIVER`; `AppConfig.get()` is typed off it. `.env.example` mirrors it |
| `database/` | `PrismaService` (global) |
| `auth/` | Global `AuthGuard` (see Auth modes), `@Public()`, `@CurrentUser()` |
| `storage/` | `StorageService.save / saveAs / load / tryLoad` (see Storage drivers) |
| `events/` | `RoomEventsService`: in-memory per-room pub/sub behind the SSE stream |
| `jobs/` | General jobs queue: `JobsService` (register/enqueue/runner), `JobsRepository` (SKIP LOCKED claim), `retry.ts` (backoff) |
| `http/` | `safeFetch`: https-only, size-capped, private-address-blocking fetch for every outbound call |
| `validation/` | `ZodPipe`: validates bodies/queries against contracts schemas |

### The modules (`src/modules`)

Each feature module follows the same layers: **controller → DTO → service → repository → mapper**.
Controllers parse with `ZodPipe` and pass `user.id`; services own rules and ownership checks
(`getOwnedRoom`); repositories are the only Prisma callers; mappers turn rows into `*-response.dto.ts`.

| Module | Routes | What's inside |
|---|---|---|
| `rooms/` | `/rooms` | CRUD; `rooms.validation.ts` checks openings fit their walls |
| `projects/` | `/projects`, `/projects/:id/rooms(/bulk)`, `/projects/:id/floor-plan` | Projects group rooms. `floor-plan/`: Claude reads a plan photo (`floor-plan.reader.ts`), `normalise.ts` cleans the rooms it finds |
| `style/` | `/rooms/:id/moodboard…`, `/rooms/:id/style` | Moodboard uploads/pins → `analysis/`: `palette.ts` (sharp, 60/30/10), `vibe.ts` reader (`claude-vibe.reader.ts` or `rule-vibe.reader.ts`), `dials.ts` (55 style dials) |
| `sourcing/` | `/rooms/:id/listings…` | `adapters/` (IKEA, pasted link, mock) behind `SourceAdapter`; `matching/` (query building, classify, dimensions, GLB bounds, scoring, dial words, companions, shopping list) |
| `layout/` | `/rooms/:id/layouts…` | `engine/`: `spec-builder` → `variants` (several design variants in parallel, keep the best) → `repair` (drop pieces from over-full rooms) → `PythonLayoutEngine`; `accent-wall`, `style-dials`. `editing/`: move/add/remove floor and wall pieces with geometry checks |
| `render/` | `/rooms/:id/…/renders`, `/internal/render-jobs/*` | Render job queue (own table), `WorkerTokenGuard`, `render-dials.ts` |
| `models/` | `/models?url=`, `/rooms/:id/listings/:id/model` | GLB proxy + storage cache, host allow-list `MODEL_HOSTS` |
| `chat/` | `/rooms/:id/chat` | `ChatAssistant`: `ClaudeChatAssistant` (tool use via `chat-tools.ts`) or `RuleChatAssistant` |
| `events/` | `/rooms/:id/events` | SSE controller over `RoomEventsService`, heartbeat `SSE_HEARTBEAT_MS` |
| `jobs/` | `/rooms/:id/jobs/:jobId` | Read one background job (polling fallback) |

Swappable parts are Nest providers chosen in the module file: `LAYOUT_ENGINE` (layout.module),
`VIBE_READER` (style.module), `CHAT_ASSISTANT` (chat.module), `SOURCE_ADAPTERS` (sourcing.module).
"Claude when `ANTHROPIC_API_KEY` is set, rules otherwise" is decided there and nowhere else.

### prisma (`apps/api/prisma`)

`schema.prisma`: `Project`, `Room` (floor plan + needs as JSON), `Style` (profile + image keys/meta),
`Listing`, `Layout` (engine result as JSON), `RenderJob`, `Job`. `migrations/` holds 8 migrations
(init → listing_picked → render_jobs → listing_model_url → jobs → projects → style_image_meta → room_plan_position).
`npm run db:migrate` (dev) / `db:deploy` (prod). `postinstall` runs `prisma generate`.

## apps/web

Entry: `index.html` → `src/main.tsx` → `src/app/App.tsx` (react-query client, router: `/` Landing, `/projects` Home,
`/p/:projectId?page=…&sel=…` Editor). `vite.config.ts` proxies `/api/*` to `:3000` with the prefix
stripped. More in [`apps/web/README.md`](../apps/web/README.md).

| Folder | What | Notes |
|---|---|---|
| `api/` | `client.ts` (`api()`, `apiBlob()`, `apiBytes()`, `apiUrl()` on `VITE_API_URL`, `ApiError`), `auth.ts` (login headers: `x-dev-user` or the Supabase Bearer token), `hooks.ts` (every query/mutation + `qk`), `events.ts` (`useRoomEvents`: SSE → invalidation), `types.ts` (hand-mirrored response types) | The only place that knows URLs |
| `app/` | `App.tsx`, `auth/` (Supabase sign-in gate, sign-in screen, account menu), `useEditorStore.ts` (zustand: page, selection, side-panel tabs, toast, focus), `openPinterest.ts` (docked window on the web), `desktopBridge.ts` (`window.heyJennaDesktop` typing) | |
| `home/` | `Home.tsx`, `HomeCarousel.tsx` + `carousel3d.ts` (WebGL curved carousel), `plusCard.ts` (animated "+" card texture) | plain three.js driven from React refs |
| `jenna/` | `JennaCube.tsx` + `jenna3d.ts` | the 3D terrazzo jenna |
| `editor/` | `Editor.tsx` (shell), `Canvas.tsx` (pan/zoom/focus), `LeftPanel`, `Rail`, `Dock`, `Toast`, `icons.tsx`, `model.ts` (pages → frames → layers from API data), `plans.ts` (sample plan, placement), `colour.ts`, `useMoodboardPaste.ts`, `SwapPicker.tsx` (swap a shopping-list piece's product), `frames/FloorPlanFrames.tsx`, `frames/RoomFrames.tsx` | Frames are pure views over hooks |
| `rail/` | `RailPage.tsx` (the editor's `?view=` pages) → `SharePage`, `AssetsPage`, `SellersPage`, `StylesPage`; `railData.ts` (project items, seller groups, totals, CSV) | Read every room through `useProjectRoomData` |
| `landing/` | `Landing.tsx` (the `/` page), `demoRoom.ts` (a hand-placed layout for the live 3D viewer) | No API calls |
| `viewer/` | `RoomViewer.tsx` + `viewer3d.ts` (live 360° room / rendered `room.glb`), `models.ts` (GLB cache via `/api`), `pieces.ts` (clay stand-ins), `three-kit.ts` (shared terrazzo, environment, furnish set, plan shots) | |
| `sidepanel/` | `SidePanel.tsx` (tabs), `ChatPanel.tsx`, `ShopPreview.tsx`, `StylePanel.tsx` (style dials), `PinterestPanel.tsx` (desktop only), `types.ts` | |
| `styles/` | `studio.css`: one global sheet ported from the prototype; `style-editor.css` for the Style tab | class names, no CSS modules |
| `public/` | `pins/*.webp`: prototype images (see the audit) | |

Request types come from `@hey-jenna/contracts` through a `tsconfig` path to its `src/` (type-only), so
the web app doesn't need the package built.

## apps/desktop

`src/main.ts`: one `BaseWindow` with two `WebContentsView`s: the studio and pinterest.com
(`persist:pinterest` session). Dev loads `HJ_WEB_URL`; packaged serves `apps/web/dist` on `hj://studio/`
and forwards `hj://studio/api/*` to `HJ_API_URL` / `config.json` `apiUrl`. IPC: `pinterest:bounds`,
`pin:add`. `preload-studio.ts` exposes `window.heyJennaDesktop`; `preload-pinterest.ts` adds the
"+ Add to moodboard" button. Built by `tsc` (check) + `esbuild` (three entry points). Details:
[`apps/desktop/README.md`](../apps/desktop/README.md).

## engines/layout

`design_logic.py` (~1700 lines, stdlib only): `spec.json` in → `layout.json` out (objects, checks,
layers, fill log). Rules live in the `R` dict at the top. `example_input.json` and `profiles/*.json`
are CLI fixtures. The API calls it through `PythonLayoutEngine` (`PYTHON_BIN`, 60 s timeout, temp
dir per run). Rules and inputs: [`engines/layout/README.md`](../engines/layout/README.md) (partly stale,
see the audit).

## workers/render

`worker.py`: poll `POST /internal/render-jobs/claim` with `x-worker-token`, fetch product GLBs
(only `MODEL_HOSTS`, cached in `MODEL_CACHE`), run
`blender -b -P blender/render_layout.py -- layout.json room.png room.glb`, upload to `/complete` or
report `/fail`. `blender/render_layout.py` builds the scene (reuses `build_room.py` builders),
`blender/dial_mapping.py` turns materials/lighting dials into Blender values. Env: `WORKER_TOKEN`,
`API_URL`, `BLENDER_BIN`, `SAMPLES`, `PCT`, `POLL_SECONDS`. See
[`workers/render/README.md`](../workers/render/README.md).

## packages/contracts

zod schemas, each exported as both a value and a type of the same name:

| File | Holds |
|---|---|
| `furniture.ts` | `FURNITURE_TYPES`, `FurnitureType`, `Size` |
| `floor-plan.ts` | `Wall`, `Window`, `Door`, `WallFinish`, `FloorPlan` |
| `style-dials.ts` | the 55 dials: `StyleDialsShape`, `StyleDials`, `StyleDialsPatch`, `densityBand`; re-exports `style-dial-meta.ts` |
| `style-dial-meta.ts` | zod-free: option lists, `DIAL_DEFAULTS`, `DIAL_SECTIONS` (the Style tab's sections, labels, ranges); the web app imports it as `@hey-jenna/contracts/dial-meta` |
| `style-profile.ts` | `StyleProfile` (palette, vibe, keywords, shape family, dials) |
| `listing.ts` | `ListingSource`, `Listing` |
| `chat.ts` | `ChatTurn`, `ChatRequest`, `ChatAction`, `ChatResponse` |
| `project.ts` | `ProjectInput`, `BulkRoomInput` |
| `moodboard.ts` | `MoodboardImage`, `MoodboardImagesResponse`, `PinRef`, `AddPinsRequest` |

The API imports the built `dist/` (run `npm run build -w @hey-jenna/contracts` after changes); the web
app reads `src/` directly. Response DTOs are **not** in contracts yet (see Contracts below).

## tools

| Script | What |
|---|---|
| `eval-rooms.mjs <roomId…>` | fresh search + layout per room, prints a quality table (rules, dropped, colour, proportions, price, time) |
| `render-latest.mjs <outDir> <roomId…>` | queues a render of each room's latest layout, runs the worker `--once`, saves PNGs |
| `show-room.mjs <roomId>` | prints the seating group's products and links from the latest layout |

All need the API running with `AUTH_MODE=dev` (they send no `x-dev-user`, so they act as `dev-user`).

## docs

[`how-it-works.md`](how-it-works.md) (product flow), [`STATUS.md`](STATUS.md) (built / left / how we
work), [`production-setup.md`](production-setup.md) (accounts and keys),
[`style-dials.md`](style-dials.md) (the 55 dials and where each one acts), and this page.

## Patterns and conventions

### Layering
API: controller → DTO → service → repository → mapper, one folder per feature. Modules talk to each
other only through exported services (`StyleService.getProfile`, `SourcingService.chooseForRoom`,
`LayoutService.getData`), never each other's repositories. Pure logic (scoring, geometry, repair,
retry, palette) sits in plain functions next to the module, so specs test it without Nest.
Web: components → hooks (`api/hooks.ts`) → `api/client.ts`. Components never call `fetch` for JSON.

### Contracts
Request bodies and shared shapes are zod in `packages/contracts`; the API validates with `ZodPipe` and
the web app imports the same types. Response DTOs live in `apps/api/src/modules/*/dto/*-response.dto.ts`
and are mirrored by hand in `apps/web/src/api/types.ts` (move them into contracts when you touch them).

### react-query keys
All keys come from `qk` in `apps/web/src/api/hooks.ts`, nested so one invalidation covers children:

```
['projects']                       ['projects', id]            ['projects', id, 'rooms']
['rooms', id, 'style' | 'moodboard' | 'listings' (, type)]
['rooms', id, 'layouts']           ['rooms', id, 'layouts', layoutId (, 'shopping-list')]
['rooms', id, 'renders']           ['rooms', id, 'renders', jobId]          ['blob', path]
```

Defaults (App.tsx): `staleTime` 30 s, no refetch on focus, no retry on 4xx.

### The events stream
`GET /rooms/:roomId/events` (SSE). Services call `RoomEventsService.publish(roomId, type, data)`;
types are `listings.search.*`, `layout.generated`, `layout.object.added/moved/removed`,
`render.queued/running/done/failed`, `job.queued/running/done/failed`. The web's `useRoomEvents`
maps each type to `qk` invalidations (render events also `setQueryData` the job). EventSource can't
send headers, so this route alone accepts `?dev_user=` / `?access_token=`. In memory: one API
instance only (README "Known limits").

### The job queue
`jobs` table + `JobsService` inside the API. Modules `register(kind, handler)` in `onModuleInit`
(today: `listing_search`, used by `POST …/listings/search?async=1` → `202 {jobId}`). The runner
polls every `JOBS_POLL_MS`, claims with `FOR UPDATE SKIP LOCKED`, runs up to `JOBS_CONCURRENCY`,
retries with backoff (5 s doubling, max 5 min) and announces `job.*` events. `JOBS_RUNNER=off` makes an
instance enqueue only.

### The render job flow
Separate table (`render_jobs`) and external workers:

```
POST /rooms/:r/layouts/:l/renders ──▶ RenderJob queued ── render.queued ──▶ SSE
worker: POST /internal/render-jobs/claim (x-worker-token, SKIP LOCKED) ◀── job + layout + render dials
        Blender → room.png + room.glb
        POST /internal/render-jobs/:id/complete (multipart image, model) ──▶ storage ── render.done
web: GET /rooms/:r/renders/:id/image | /model (apiBlob / GLTFLoader) → RoomFrames + viewer
```

Without `WORKER_TOKEN` the worker routes are closed.

### Auth modes
`AUTH_MODE=dev` (default): no login; user id from `x-dev-user` (default `dev-user`); the web app sends
`localStorage['hj-dev-user']` or `dev-user`. `AUTH_MODE=supabase`: `Authorization: Bearer <jwt>`
verified with `jose` against `SUPABASE_JWT_SECRET` (HS256) or the project's JWKS. Every route is
protected unless `@Public()` (only `/health`); worker routes use `WorkerTokenGuard` instead. Every
service checks ownership through the room's `ownerId`. The web app has no Supabase login yet (STATUS #7).

### Storage drivers
`STORAGE_DRIVER=local` writes under `apps/api/uploads/<key>`; `supabase` uses the
`SUPABASE_BUCKET` bucket with the service-role key. Keys: `moodboards/<room>/<uuid>.img`, render PNG/GLB,
cached models. Callers only see keys; files are streamed back through API routes, never public URLs.

### Outbound HTTP
Every outbound fetch (sources, moodboard links, models) goes through `common/http/safe-fetch.ts`. No
scraping: official APIs, IKEA's public search, or search-engine results.

## How data flows

```
                 ┌──────────── apps/desktop (Electron) ────────────┐
                 │  studio view          pinterest.com view        │
                 │      ▲  IPC pin:add / pinterest:bounds  │        │
                 └──────┼──────────────────────────────────┼────────┘
                        │ same bundle                      │
  apps/web (React) ─────┘                                  ▼
   hooks.ts ──fetch /api/*──▶ Vite proxy / hj:// ──▶ apps/api (NestJS)
   events.ts ◀──── SSE /rooms/:id/events ─────────── RoomEventsService ◀── every module publishes
                                                         │
     ┌────────────┬───────────────┬──────────────┬───────┴──────┬──────────────┐
  projects/     style/          sourcing/       layout/        render/        chat/
  rooms/        moodboard →     SourceAdapters  spec-builder   RenderJob      Claude tools
  floor-plan    palette+vibe    IKEA·link       → variants     queue          or rules
  (Claude)      +dials          mock            → repair             │
     │          (Claude/rules)  │ jobs queue    → python3            │
     │             │            │ (async)         engines/layout     │
     ▼             ▼            ▼                 /design_logic.py   │
  ┌──────────────── Postgres (Prisma) + StorageService ─────────────┐│
  │ projects rooms styles listings layouts jobs render_jobs │ files ││
  └─────────────────────────────────────────────────────────┴───────┘│
                                                                     ▼
            workers/render/worker.py ── claim / complete (x-worker-token) ──▶ /internal/render-jobs
                     └─ Blender: blender/render_layout.py → room.png + room.glb
```

Order of dependence: style needs a moodboard → sourcing reads the style profile → layout reads the
room, style and chosen listings → render reads the stored layout and style dials. Chat calls the same
services as tools.

## Tests

| Where | What | Run |
|---|---|---|
| `apps/api/src/**/*.spec.ts` (30 suites, 168 tests) | Jest + ts-jest, unit tests next to the code; `spec-builder.spec.ts` runs the real Python engine | `npm test` (builds contracts first) |
| `workers/render/test_dial_mapping.py` | unittest for dial → Blender values, no Blender needed | `python3 workers/render/test_dial_mapping.py` |
| type checks | API, web, desktop | `npx tsc -p apps/api --noEmit`, `npx tsc -p apps/web --noEmit`, `npm run build -w @hey-jenna/desktop` |
| build | web production bundle | `npm run build -w @hey-jenna/web` |
| `tools/eval-rooms.mjs` | quality numbers against a live API (manual) | `node tools/eval-rooms.mjs <roomId>` |

There are no web or desktop tests, and no e2e tests (the `test:e2e` scripts point at a missing
`apps/api/test/jest-e2e.json`; see the audit).

## Useless code (found 2026-11-13)

Checks run on `main` at `c3e640d`: `npx knip@5`, `npx depcheck` per package,
`tsc --noEmit --noUnusedLocals --noUnusedParameters` on api/web/desktop/contracts (clean), a script
that matches every class selector in `studio.css` against the string literals in `apps/web/src` and
`apps/desktop/src` (then a hand check of generated names like `lv${lvl + 1}`), `git grep` for each
export / route / env var / asset, a scan of service and repository methods for callers, a scan of Python
`def`s (none dead), `git worktree list`, `git branch --merged origin/main` and `git branch -r --merged`.

**2026-11-14:** every row marked "yes" below was removed (PR `chore/remove-unused`): the `pins/`
images, the `test:e2e` scripts and `include: ["test"]`, the unused CSS, `useSearchListings`, `qk.room`,
`Close`, `isFurnitureType`, the `export` keywords listed, `supertest` / `@types/supertest` /
`@nestjs/testing`, and the web copies of `PinRef` and `MoodboardImage` (now from contracts). The merged
worktrees and branches were removed too. Rows marked "keep" or "check first" are unchanged.

### Files and stale scripts

| Path or name | What it is | Evidence it's unused | Safe to delete? |
|---|---|---|---|
| `apps/web/public/pins/*.webp` (24 files, 936 KB) | Prototype moodboard / plan / room images | No reference to `pins/`, any of the file names or `.webp` paths in `apps/web/src`, `index.html`, CSS or desktop; untouched since the scaffold commit `4fb0781` | yes |
| `test:e2e` scripts (root and `apps/api/package.json`) | Jest e2e runner | `apps/api/test/jest-e2e.json` and `apps/api/test/` don't exist; the API `tsconfig.json` `include: ["test"]` points at nothing | yes (or write e2e tests) |
| `engines/layout/README.md` sections | Refs to `variants.py`, `../blender/build_room_v6_layout.py`, `render-v6-*.png`, `compare-*.jpg` | None of these files are in the repo (variants now live in `apps/api/.../engine/variants.ts`) | check first: fix the text, don't delete the README |
| `engines/layout/example_input.json`, `profiles/*.json` | CLI fixtures for `design_logic.py` | Only named in `design_logic.py`'s usage line and the README; no spec uses them | keep (documented manual run) |
| `tools/eval-rooms.mjs`, `render-latest.mjs`, `show-room.mjs` | Dev scripts | knip: unused files (expected, they're entry points); not mentioned in any doc; fields they read still match `LayoutResponseDto` | keep (document them; this page now does) |
| `apps/desktop/src/preload-*.ts` | Electron preloads | knip flags them, but they are esbuild entry points in `build` | keep (false positive) |

### Web: hooks, components, exports

| Path or name | What it is | Evidence it's unused | Safe to delete? |
|---|---|---|---|
| `useDeleteProject` (`api/hooks.ts`) | DELETE /projects/:id | knip; only its definition matches | check first: no delete-project UI yet |
| `usePatchStyle` | PATCH /rooms/:id/style | knip; definition only | keep: STATUS #5 (dial editing UI) |
| `useSearchListings` | sync search | knip; the UI uses `useSearchListingsAsync` | yes |
| `useAddListingLink`, `usePickListing` | paste a link / pick a listing | knip; definition only | keep: STATUS #2 (swap from search results) |
| `useLayout`, `useShoppingList` | GET one layout / its shopping list | knip; the UI reads `useLatestLayout` (which embeds the list) | check first |
| `usePatchLayoutObject` | PATCH layout objects | knip; definition only | keep: STATUS #1 (edit furniture in 3D) |
| `qk.room` | query key | no `qk.room(` anywhere | yes |
| `Close` icon (`editor/icons.tsx`) | SVG icon component | knip; only its definition (SidePanel's "Close" is an aria-label) | yes |
| `money` (`frames/RoomFrames.tsx`) | price formatter | exported but only used in its file; `sidepanel/ShopPreview.tsx` defines its own copy | yes, the export (share one helper) |
| `API_BASE`, `modelPath`, `renderModelBytes`, `TERRAZZO_CHIPS`, `furnish`, `PIN_DRAG_TYPE`, `RoomsIntake` | exports | knip: no importer; each is used inside its own file | yes, the `export` keyword only |
| 17 exported types (`RoomViewerProps`, `HomeCarouselProps`, `PlanRow`, `DesktopBridge`…) | prop / helper types | knip: unused exported types; all used locally | keep (harmless) |

### Web: CSS selectors in `apps/web/src/styles/studio.css` (437 lines)

| Selector(s) | What it is | Evidence it's unused | Safe to delete? |
|---|---|---|---|
| `.pp`, `.pp header/footer…`, `.pp-ic`, `.pp-connect`, `.pp-art`, `.pp-tools`, `.pp-search`, `.pp-tabs`, `.pp-hint`, `.pp-grid`, `.pp-cols`, `.pp-pick`, `.pp-import`, `.pp-err`, `.pp-boards`, `.pp-clear`, `.sp-body .pp`, `.pp footer .pbtn` (lines ~250–282, 322, 382–397) | Removed in-studio Pinterest panel (PR #32 removed its backend) | No class string in TSX; PinterestPanel.tsx uses none of them | yes |
| `.pinc…`, `.padd…` (273–280, 399) | Pin cards and their "+" button in that panel | No class string in TSX | yes |
| `.stage.pp-on …` (300–302), `.stage.pv-on …` (214–215) | Layout shifts for the old floating Pinterest / preview panels | `pp-on` / `pv-on` never set (the editor uses `.app.sp-on`) | yes |
| `.ctx`, `.ctx-h`, `.ctx button/a/hr` (284–288, 388) | Context menu | No `ctx` class anywhere | yes |
| `.hv-row`, `.hv-card…`, `.hv-card .plus`, `.hv-stage.stub` (338–345) | Card row from the prototype carousel | Carousel is a canvas (`carousel3d.ts`); none of these classes set | yes |
| `.jcube`, `.jcube svg` (347–348) | SVG jenna | Replaced by `.jcube3d` | yes |
| `.field…`, `.grid2`, `.chip`, `.mcp` (111–117) | Inspector form controls from the prototype | No class string in TSX | yes |
| `.row…` (83–87), `.tabs` (104), `.section…`, `.sec-label…` (142–146) | Prototype list rows, tab bar, canvas sections | No `className` uses them (only JS identifiers of the same name) | yes |
| `.layer .k`, `.layer.child`, `.layer.lv0` (52–53, 155) | Layer-row variants | Rows get `lv1`/`lv2` only (`lv${lvl + 1}`, `lvl` is 0 or 1); no `k` / `child` class | yes (keep `.lv2`) |
| `.frame.drop-on`, `.frame-body.pad`, `.mood .tile.empty-tile`, `.tile.pin .tx`, `.render-img`, `.viewer-stub…`, `.sp-stub…`, `.err` | Old drop highlight, padding, empty tile, pin remove "x", render `<img>`, viewer and side-panel stubs, error text | No class string in TSX (drop highlight is now an inline style) | yes |

### API: endpoints and service methods

| Path or name | What it is | Evidence it's unused | Safe to delete? |
|---|---|---|---|
| `GET /models?url=` (`ModelsController.byUrl`) | Proxy any allowed GLB | No caller: web uses `/rooms/:r/listings/:l/model`, the worker fetches IKEA GLBs itself | check first: documented in README endpoints |
| `POST/PATCH/DELETE …/layouts/:l/objects…` | Add / move / swap / remove pieces | No caller in web, desktop, worker or tools | keep: documented public API, STATUS #1 |
| `GET /rooms`, `GET/PATCH/DELETE /rooms/:id`, `POST /rooms` | Room CRUD | Web uses project routes; only `tools/eval-rooms.mjs` calls `GET /rooms/:id` | keep: documented public API |
| `GET /rooms/:r/jobs/:jobId` | Job status | No caller (web relies on SSE) | keep: documented polling fallback |
| `GET …/layouts/:l`, `…/shopping-list`, `PATCH …/listings/:l`, `POST …/listings/link`, `PATCH …/style`, `DELETE /projects/:id`, sync `POST …/listings/search` | | Only the unused web hooks above (and tools for sync search) | keep: documented public API |
| `RoomEventsService.listenerCount` | Count of open streams | Only `events.service.spec.ts` | check first (test-only) |
| `isFurnitureType` (`chat/chat-tools.ts`) | Type guard | knip; only its definition | yes |
| `VARIANTS`, `seatingSpread`, `fillerCount`, `badness` (`engine/variants.ts`), `doorZones`, `windowZones` (`editing/floor.ts`), `WALL_TYPES`, `wallObstacles` (`editing/walls.ts`), `FloorPlanReadError`, `USER_AGENT`, `woodWord`, `parseSize`, `parseFlatSize` | exports | knip: no importer, specs included; all used inside their own file | yes, the `export` keyword only |
| `RoomEventType`, `RoomEvent`, `JobHandler`, `ClaimedJob`, `MoodboardFile`, … (12 types) | exported types | knip; used locally | keep (harmless) |

### Env vars and config

| Path or name | What it is | Evidence it's unused | Safe to delete? |
|---|---|---|---|
| All 25 keys in `apps/api/src/common/config/env.ts` | API env | Each is read via `config.get('…')`; `DATABASE_URL` by `schema.prisma` | keep (none unused) |
| Worker `BLENDER_BIN`, `POLL_SECONDS`, `MODEL_CACHE`, `API_URL`, `SAVE_BLEND` | Worker env | Used in `worker.py` / `render_layout.py`, but not in `.env.example` | keep; document them |
| `apps/api/tsconfig.json` `include: ["test"]` | tsconfig | Folder missing | yes (with the e2e scripts) |

### npm dependencies

| Path or name | What it is | Evidence it's unused | Safe to delete? |
|---|---|---|---|
| `supertest`, `@types/supertest` (api dev) | HTTP e2e testing | depcheck + knip; no import | yes (unless e2e tests are written) |
| `@nestjs/testing` (api dev) | Nest test module | depcheck + knip; specs build services by hand | yes |
| `ts-node` (api dev) | TS runner | depcheck + knip; jest uses ts-jest, `nest start` uses tsc | check first (`nest start` falls back to it for some configs) |
| `@types/multer` (api dev) | types | depcheck flags it, but `Express.Multer.File` is used in 3 controllers | keep (false positive) |
| `@nestjs/schematics`, `@types/jest` (api dev) | Nest CLI collection, jest globals | depcheck flags; used by `nest-cli.json` and every spec | keep (false positive) |
| `@types/node` (desktop) | types | depcheck: *missing*; `tsconfig` lists `types: ["node"]`, it resolves only through hoisting | keep; add it to desktop devDependencies |
| web, contracts | | depcheck: no issues | n/a |

### Contracts and duplicate types

| Path or name | What it is | Evidence it's unused | Safe to delete? |
|---|---|---|---|
| `DIAL_COUNT` (`style-dials.ts`) | Dial count | Only `dials.spec.ts` and `docs/style-dials.md` | check first (test/docs only) |
| `ARM_STYLES`, `LEG_STYLES`, `RUG_SHAPES` … (15 option lists), `StyleDialsShape`, `Door`, `WallFinish` | Option lists / sub-schemas | No importer outside contracts; each builds a schema in the same package | keep (export is harmless) |
| `apps/web/src/api/types.ts` `PinRef` | Duplicate | Same shape as contracts `PinRef` | yes: import from contracts |
| `apps/web/src/api/hooks.ts` `MoodboardImage` + `{images}` | Duplicate | Same as contracts `MoodboardImage` / `MoodboardImagesResponse` | yes: import from contracts |
| `types.ts` `RoomEventType`, `RoomEvent` | Duplicate | Copy of `apps/api/src/common/events/events.service.ts` | check first: move to contracts, then import in both |
| `types.ts` `Project`, `Room`, `StyleResponse`, `Listing`, `SearchSummary`, `JobAccepted`, `PlacedObject`, `ShoppingItem`, `ShoppingList`, `Layout`, `EditResult`, `RenderJob`, `DetectedRoom`, `FloorPlanReadResult` | Hand-mirrored response DTOs | Copies of `apps/api/src/modules/*/dto/*-response.dto.ts` (STATUS: move when touched) | check first: move to contracts, don't just delete |

### Git worktrees (`~/repos/hey-jenna-*`)

All are clean (`git status` empty) and their branch is in `origin/main` unless noted. Ignored files
(`.env`, `uploads/`) don't show in `git status`, so those are marked.

| Path or name | What it is | Evidence it's unused | Safe to delete? |
|---|---|---|---|
| `hey-jenna-chat` (`feat/jenna-chat`), `-desktop` (`feat/desktop`, 1.3 GB), `-docs` (`docs/how-it-works`), `-ds` (`feat/dials-shape`), `-etsy` (`feat/etsy-source`), `-mb` (`feat/moodboard-images`), `-nopin` (`chore/remove-pinterest-api`), `-pins` (`feat/pinterest`), `-plan` (`feat/plan-from-photo`), `-projects` (`feat/projects`), `-rss` (`feat/pinterest-rss`) | Worktrees, ~490 MB each (node_modules) | Branch merged into `origin/main`; clean | yes (`git worktree remove`) |
| `hey-jenna-dr` (`docs/ikea-no-key`) | Worktree | Merged, clean; holds `apps/api/uploads` (13 MB) | yes, after a look at uploads |
| `hey-jenna-platform` (`feat/platform`) | Worktree | Merged, clean; holds `apps/api/.env` (may have keys) | check first: copy the `.env` if needed |
| `hey-jenna-web` (detached at `7773da5`) | Worktree, 958 MB | `7773da5` is in main; holds `.env` and `uploads` (35 MB) | check first: `.env`, uploads |
| `hey-jenna-dl` (`feat/dials-layout`) | Worktree | **Not merged** (STATUS #4, unreviewed) | keep |
| `~/repos/hey-jenna` on `feat/style-dials` | Main checkout | Branch merged; it's the primary checkout | keep; switch it to `main` |

### Branches

| Path or name | What it is | Evidence it's unused | Safe to delete? |
|---|---|---|---|
| 38 local branches merged into `origin/main` (`chore/remove-pinterest-api`, `docs/frontend-scaffold`, `docs/frontend-scaffold-react`, `docs/how-it-works`, `docs/ikea-no-key`, `docs/remove-frontend-scaffold`, `feat/add-floor-pieces`, `feat/add-to-wall`, `feat/better-picks-and-layout`, `feat/desktop`, `feat/dials-render`, `feat/dials-shape`, `feat/etsy-source`, `feat/foundation`, `feat/ikea-3d-models`, `feat/ikea-source`, `feat/jenna-chat`, `feat/layout`, `feat/match-prototype`, `feat/moodboard-accent-wall`, `feat/moodboard-images`, `feat/pinterest`, `feat/pinterest-rss`, `feat/plan-from-photo`, `feat/platform`, `feat/projects`, `feat/render`, `feat/render-3d`, `feat/render-ui-trim`, `feat/rooms`, `feat/sourcing`, `feat/style`, `feat/style-dials`, `feat/tune-colours`, `feat/walls-and-true-sizes`, `feat/web`, `fix/ikea-search-resilience`, `fix/shelf-choice`) | Local branches | `git branch --merged origin/main` | yes (remove the worktrees first; `git branch -d` refuses unmerged ones) |
| The same 38 on `origin/…` | Remote branches | `git branch -r --merged origin/main` | yes (`git push origin --delete …`; GitHub's "delete branch on merge" would stop new ones) |
| `feat/dials-layout` (local + `origin`) | Unmerged work | `--no-merged`; last commit 2026-11-12 | keep (STATUS #4) |
