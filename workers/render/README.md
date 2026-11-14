# render worker

Turns a layout into a picture (PNG) and a 3D model (.glb) with Blender.

```
API  POST /rooms/:roomId/layouts/:layoutId/renders   → job "queued" (render_jobs table)
worker  POST /internal/render-jobs/claim             → job + layout   (FOR UPDATE SKIP LOCKED)
        blender -b -P blender/render_layout.py -- layout.json room.png room.glb
        POST /internal/render-jobs/:id/complete      → PNG + GLB saved to storage, job "done"
app  GET /rooms/:roomId/renders/:jobId               → status, imageUrl, modelUrl
```

Run (needs Blender 4.2+, the API running, WORKER_TOKEN in `apps/api/.env`):

```bash
npm run worker              # keeps polling
npm run worker -- --once    # one job, then exit
```

`SAMPLES` / `PCT` trade quality for speed (128 / 100 by default; 32 / 50 for quick previews).
In production the same script runs on a GPU box (Modal, RunPod…) with `API_URL` pointing at the API.

Limits: openings are cut in the back wall only (others are skipped); furniture is drawn
procedurally in the clay style, not from product photos.
