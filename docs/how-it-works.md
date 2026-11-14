# How hey jenna works

One page for a new teammate or agent: what each part does, how a room goes from a moodboard to a
rendered 3D room, and where Blender and the desktop app fit.

## The pieces

```
 Studio (React, apps/web)  ──or──  Desktop app (Electron, apps/desktop: the same studio + Pinterest in the side panel)
        │  HTTP /api + live events (SSE)
        ▼
 API (NestJS, apps/api) ──── Postgres + file storage (Supabase in production, local Docker + disk in dev)
   │      │        │
   │      │        └─ Claude: reads moodboards and floor-plan photos, answers jenna chat
   │      └─ Sources: IKEA (no key, real 3D models) · eBay · Etsy · Brave web search (Kijiji, FB Marketplace)
   └─ Layout engine (Python, engines/layout): places the furniture with interior-design rules
        │
        ▼  render job (Postgres queue)
 Render worker (Python + Blender, workers/render): a GPU machine in production, any Mac/PC in dev
        → photo (PNG) + the whole room as a 3D model (room.glb) → back to the API → shown in the studio
```

## A room, start to finish

1. **Project and rooms.** Press **+** on the home screen. On the Floor plan page, upload a plan photo
   (Claude finds every room and space; the API turns the printed sizes into metres itself, fits doors and
   windows onto the walls, and marks open-plan sides as open walls), draw rooms, or use the sample plan.
   Each room the engine can furnish (living rooms and offices for now) gets its own page with layers:
   Moodboard, Palette, 3D room, Shopping list. Bedrooms, closets, laundry, balconies and the like stay
   on the plan only. The Floor plan page shows the plan, an isometric 3D floor plan and the rooms found.
   An open wall has no wall in the 3D views; the layout engine keeps a 1 m way through it clear, and if
   a small open-plan room still won't fit, lays it out as if that side were a wall and takes down
   anything that would hang on it.
2. **Moodboard.** Upload images, or bring pins from Pinterest: drag them onto the moodboard, paste them
   (⌘V), or in the desktop app use the Pinterest tab's **+ Add to moodboard**. The API reads the
   palette, the style and 55 style dials from the images.
3. **Find products.** The API searches every source in the room's style and colours, sized to the room,
   and scores each listing. IKEA listings come with real 3D models.
4. **Lay out the room.** The Python engine places the best pieces with design rules (walkways, doors,
   windows, focal point) and writes the shopping list with prices and links.
5. **See it.** The 3D room frame shows a live 360° model straight away (real IKEA models, clay stand-ins
   for second-hand pieces). The side panel has the live shopping list and jenna chat.
6. **Render.** Press **Render**: the API queues a job, the render worker builds the room in Blender,
   renders a photo and exports the whole room as `room.glb`. The 3D frame then shows that rendered room
   in 360° (**Render 3D**); **Live** switches back to the editable model; **Re-render** makes a new one.

Changes arrive in the studio live over the events stream (search finished, layout made, render done).

## Blender and the desktop app

The desktop app is a **shell around the same studio**. It does not run Blender. Renders work exactly
like the web version:

```
Desktop app / web studio ── Render ──▶ API (queues a job) ──▶ render worker (Blender on a GPU machine)
                         ◀── room.glb + PNG ── API (stores them) ◀── worker uploads the results
```

So in production, the desktop app needs the hosted API and a hosted render worker (Modal or RunPod),
the same as the web version. Point the app at the API with `HJ_API_URL`, or `apiUrl` in its
`config.json` (see `apps/desktop/README.md`).

**In development**, your own Mac is the render worker: `npm run worker` runs Blender locally against
the local API. That is the same worker code a GPU machine runs in production.

### If renders ever run on the user's own computer

Not built, and not planned for now. What it would take:

- **Blender on the user's machine:** about a 400 MB download, fetched on first render or installed by
  the user. Cycles uses Apple Silicon's GPU (about 45 s per render on a recent M-series Mac); older
  Intel Macs are much slower.
- **A per-user worker:** today the worker uses one shared `WORKER_TOKEN` and takes *anyone's* job.
  A worker on a user's computer must only claim that user's own jobs and log in as them, so the
  worker endpoints would need user-scoped auth instead of the shared secret.
- **The desktop app starts the worker** (a Python process running Blender) when a render is
  requested, and stops it after.
- The API, database, login and product search stay hosted either way.

Rough size: a few days of work. It saves GPU costs but makes renders depend on the user's hardware,
so a sensible later setup is "Render on this Mac" in the desktop app, with the cloud GPU as the default.

## Where to go next

- Run it locally: the root `README.md`.
- Accounts and keys for production: `docs/production-setup.md`.
- What's built, what's left, how we work: `docs/STATUS.md`.
- The style dials: `docs/style-dials.md`.
