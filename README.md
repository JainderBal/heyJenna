# hey jenna

Give it a **moodboard** and a **floor plan**. It finds **real furniture you can buy**
(eBay, Kijiji, Facebook Marketplace, IKEA, or any link you paste) in the same style and colours,
places it in your room with interior-design rules, and lets you move or swap pieces.

This repo is the **backend** (the frontend comes later in `apps/web`).

## How it works

```
floor plan ──▶ rooms        (the room you drew: size, windows, doors)
moodboard  ──▶ style        (palette 60/30/10 + vibe + shop keywords; Claude vision or rules)
                 │
                 ▼
             sourcing       (shopping list from room + needs → search every source → size, colour, score)
                 │
                 ▼
             layout         (Python design engine places the products; repairs over-full rooms)
                 │
                 ▼
     move / turn / swap / remove pieces · shopping list with total price
                 │
                 ▼
             render         (job queue in Postgres → Blender worker → PNG + .glb 3D model)
```

## Stack

- **API:** NestJS (TypeScript), layered per feature: controller → DTO → service → repository → mapper
- **Database + auth + storage:** Supabase (Postgres via Prisma, Supabase Auth JWTs, Supabase Storage)
- **Layout engine:** Python (`engines/layout/design_logic.py`), standard library only, behind a `LayoutEngine` interface
- **Moodboard reading:** Claude (`claude-opus-5-5`) with schema-checked JSON; rule-based fallback without a key
- **Shared types:** `packages/contracts` (zod)

```
apps/api/src/
  common/        config · database · auth · storage · http (safe fetch) · validation
  modules/
    rooms/       hand-drawn floor plans
    projects/    a home or job that groups rooms
    style/       moodboard → palette + vibe
    sourcing/    shopping list · sources (mock, eBay, web search, link) · sizes · scoring · picks
    layout/      engine adapter · spec builder · auto-repair · edits · shopping list
    render/      render jobs (Postgres queue, SKIP LOCKED) · worker endpoints · image / model files
engines/layout/  Python design engine
workers/render/  Blender render worker (Python, stdlib only) — see its README
packages/contracts/
```

## Run it locally

Needs Node 20+, Python 3, Docker.

```bash
npm install
npm run db:up                                  # local Postgres (stand-in for Supabase)
cp apps/api/.env.example apps/api/.env
npm run db:migrate
npm run dev                                    # API on http://localhost:3000
npm run worker                                 # render worker (needs Blender 4.2+ and WORKER_TOKEN in apps/api/.env)
```

With the defaults (`AUTH_MODE=dev`, `SOURCES=mock,…`) everything works with **no keys**:
mock products, rule-based moodboard reading, no login.

| Turn on | Set in `apps/api/.env` |
|---|---|
| Real database | `DATABASE_URL` = your Supabase connection string |
| Real login | `AUTH_MODE=supabase`, `SUPABASE_URL` (+ `SUPABASE_JWT_SECRET` for older projects) |
| Supabase Storage | `STORAGE_DRIVER=supabase`, `SUPABASE_SERVICE_ROLE_KEY` |
| Claude reads moodboards | `ANTHROPIC_API_KEY` |
| eBay | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` |
| Kijiji / FB Marketplace / IKEA | `BRAVE_SEARCH_API_KEY` (search engine results only; no scraping) |
| A UI on another origin | `CORS_ORIGINS` (comma-separated; default `http://localhost:5173`) |
| Background jobs off in this instance | `JOBS_RUNNER=off` (jobs then wait for an instance with it on) |

## Try the flow

```bash
B=http://localhost:3000

# 1. a room (metres; x = left→right wall, y = back→front wall)
curl -X POST $B/rooms -H 'content-type: application/json' -d '{
  "name": "Retro loft", "needs": ["has a cat", "works from home"],
  "floorPlan": { "width": 6, "depth": 4.8,
    "windows": [{ "id": "w1", "wall": "back", "position": 3, "width": 1.6 }],
    "doors":   [{ "id": "d1", "wall": "back", "position": 1.2, "width": 0.95 }] } }'

# 2. moodboard (files and/or https image links)
curl -X POST $B/rooms/$ROOM/moodboard -F images=@moodboard.jpg

# 3. find products
curl -X POST $B/rooms/$ROOM/listings/search -H 'content-type: application/json' -d '{"perType": 4}'
curl -X POST $B/rooms/$ROOM/listings/link   -H 'content-type: application/json' -d '{"url": "https://…"}'
curl -X PATCH $B/rooms/$ROOM/listings/$LISTING -H 'content-type: application/json' -d '{"picked": true}'

# 4. lay out the room, then play with it
curl -X POST  $B/rooms/$ROOM/layouts
curl -X PATCH $B/rooms/$ROOM/layouts/$LAYOUT/objects/desk_1 -H 'content-type: application/json' -d '{"x": 1.2, "rotationDeg": 90}'
curl -X PATCH $B/rooms/$ROOM/layouts/$LAYOUT/objects/sofa_1 -H 'content-type: application/json' -d '{"listingId": "…"}'
curl -X POST  $B/rooms/$ROOM/layouts/$LAYOUT/objects -H 'content-type: application/json' -d '{"listingId": "…"}'                  # a side table: lands beside a seat
curl -X POST  $B/rooms/$ROOM/layouts/$LAYOUT/objects -H 'content-type: application/json' -d '{"listingId": "…", "x": 5.6, "y": 4.4}'  # a plant, where you say
curl          $B/rooms/$ROOM/layouts/$LAYOUT/shopping-list

# 5. render it (the worker picks the job up)
curl -X POST $B/rooms/$ROOM/layouts/$LAYOUT/renders
curl $B/rooms/$ROOM/renders/$JOB                 # status → "done"
curl $B/rooms/$ROOM/renders/$JOB/image -o room.png
curl $B/rooms/$ROOM/renders/$JOB/model -o room.glb
```

## Endpoints

| Method | Path | What |
|---|---|---|
| GET | `/health` | health check (public) |
| POST / GET | `/rooms` | create / list rooms (optional `projectId` on create) |
| GET / PATCH / DELETE | `/rooms/:id` | one room |
| POST / GET | `/projects` | create / list projects `{name, kind?, palette?}` |
| GET / PATCH / DELETE | `/projects/:id` | one project (delete keeps its rooms) |
| GET | `/projects/:id/rooms` | rooms in a project |
| POST | `/projects/:id/rooms/bulk` | create several rooms at once `{rooms: [{name, floorPlan, needs?}]}` (all or nothing) |
| POST | `/rooms/:roomId/moodboard` | upload moodboard (multipart `images`, optional `imageUrls` JSON) |
| GET / PATCH | `/rooms/:roomId/style` | style profile / tweak it |
| POST | `/rooms/:roomId/listings/search` | search all sources. `?async=1` → `202 {jobId}` at once; progress + result over the events stream |
| POST | `/rooms/:roomId/listings/link` | add a pasted product link (auto-picked) |
| GET | `/rooms/:roomId/listings?type=sofa` | listings |
| PATCH | `/rooms/:roomId/listings/:listingId` | `{picked}` |
| GET | `/rooms/:roomId/listings/:listingId/model` | the product's 3D model (GLB), fetched once from IKEA and cached |
| POST / GET | `/rooms/:roomId/layouts` | generate / list layouts |
| GET | `/rooms/:roomId/layouts/:layoutId` | one layout (objects, checks, dropped, shopping list) |
| GET | `/rooms/:roomId/layouts/:layoutId/shopping-list` | items + total |
| PATCH | `/rooms/:roomId/layouts/:layoutId/objects/:objectId` | move/turn `{x, y, rotationDeg}`, swap `{listingId}`, or re-hang a wall piece `{wall, position, height}` |
| POST | `/rooms/:roomId/layouts/:layoutId/objects` | add one of the room's products. Wall piece (art, mirror, wall shelf): `{listingId, wall?, position?, height?}` (no spot → best free spot on a visible wall). Floor piece (armchair, side table, pouf, plant, floor lamp, shelf, sideboard, rug…): `{listingId, x?, y?, rotationDeg?}` (no spot → best free floor spot next to its partner: side table/lamp by a seat, plant in a corner, storage against a wall). Spots that stick out, block a door's 90 cm or put a tall piece in front of a window are refused with `problems`; overlaps come back as `warnings` |
| DELETE | `/rooms/:roomId/layouts/:layoutId/objects/:objectId` | remove a piece (wall pieces too) |
| POST | `/rooms/:roomId/layouts/:layoutId/renders` | queue a render |
| GET | `/rooms/:roomId/renders` · `/rooms/:roomId/renders/:jobId` | render status |
| GET | `/rooms/:roomId/renders/:jobId/image` · `/model` | the PNG / .glb |
| GET | `/rooms/:roomId/events` | live updates (server-sent events): `data: {type, roomId, at, data}` for `listings.search.*`, `layout.generated`, `layout.object.added/moved/removed`, `render.queued/running/done/failed`, `job.queued/running/done/failed`; `: ping` every 20 s. EventSource can't send headers, so this route also takes `?access_token=` (or `?dev_user=` in dev) |
| GET | `/rooms/:roomId/jobs/:jobId` | a background job's status / result (polling fallback) |
| GET | `/models?url=<https://web-api.ikea.com/…glb>` | any allowed 3D model (`MODEL_HOSTS`; https, ≤ 40 MB, must be glTF), cached in storage; `model/gltf-binary`, long cache headers, `x-cache: hit/miss` |
| POST | `/internal/render-jobs/claim` · `/:jobId/complete` · `/:jobId/fail` | render workers only (`x-worker-token`) |

## Tests

```bash
npm test        # unit tests, including real runs of the Python engine
```

## Known limits

- Rooms are rectangles (4 walls). L-shaped rooms need polygon support in the engine.
- A layout takes ~4 s; over-full rooms that need auto-repair can take ~20–25 s.
- Some rooms keep one failed check (e.g. tight seat access with large real products); it is reported in `checks`.
- Renders colour pieces from the moodboard palette, not from each product's own colour yet.
- The renderer cuts windows and doors in the back wall only.
- A full-quality render takes ~45 s on an M1 Pro.
- Live updates are in memory: with several API instances, each only sees its own events (needs Postgres LISTEN/NOTIFY or Redis).
