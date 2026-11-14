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
| POST / GET | `/rooms` | create / list rooms |
| GET / PATCH / DELETE | `/rooms/:id` | one room |
| POST | `/rooms/:roomId/moodboard` | upload moodboard (multipart `images`, optional `imageUrls` JSON) |
| GET / PATCH | `/rooms/:roomId/style` | style profile / tweak it |
| POST | `/rooms/:roomId/listings/search` | search all sources |
| POST | `/rooms/:roomId/listings/link` | add a pasted product link (auto-picked) |
| GET | `/rooms/:roomId/listings?type=sofa` | listings |
| PATCH | `/rooms/:roomId/listings/:listingId` | `{picked}` |
| POST / GET | `/rooms/:roomId/layouts` | generate / list layouts |
| GET | `/rooms/:roomId/layouts/:layoutId` | one layout (objects, checks, dropped, shopping list) |
| GET | `/rooms/:roomId/layouts/:layoutId/shopping-list` | items + total |
| PATCH | `/rooms/:roomId/layouts/:layoutId/objects/:objectId` | move/turn `{x, y, rotationDeg}` or swap `{listingId}` |
| DELETE | `/rooms/:roomId/layouts/:layoutId/objects/:objectId` | remove a piece |
| POST | `/rooms/:roomId/layouts/:layoutId/renders` | queue a render |
| GET | `/rooms/:roomId/renders` · `/rooms/:roomId/renders/:jobId` | render status |
| GET | `/rooms/:roomId/renders/:jobId/image` · `/model` | the PNG / .glb |
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
