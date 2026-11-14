# Production setup: accounts and keys

Everything runs locally with **no accounts** (local Postgres, `AUTH_MODE=dev`, local file storage,
IKEA products and 3D models). This page is what you need to put hey jenna online.

Put API values in `apps/api/.env` locally, and in your host's environment settings in production.
Never commit real keys. Keep the Supabase service-role key and `WORKER_TOKEN` server-side only.

## Required for production

| Service | Get it at | Env vars | Used for |
|---|---|---|---|
| **Supabase** (one project) | https://supabase.com/dashboard | `DATABASE_URL` (Project Settings → Database → connection string), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` (default `moodboards`; create it in Storage). Set `AUTH_MODE=supabase` and `STORAGE_DRIVER=supabase`. `SUPABASE_JWT_SECRET` only for older projects that sign tokens with HS256. | Postgres, login, and file storage (moodboards, renders, cached 3D models). For login also set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon public key, never the service-role key) in the web host's build settings, enable the Email and Google providers, and add the web app's URL under Authentication → URL Configuration |
| **Anthropic** | https://console.anthropic.com/settings/keys | `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`, default `claude-opus-5-5`) | Reading the moodboard's style (without it only colours are read), jenna chat answers, reading a floor-plan photo (422 without it). Pay-as-you-go. |
| **API host** (Render, Railway or Fly) | https://dashboard.render.com · https://railway.com · https://fly.io | `PORT`, `CORS_ORIGINS` = the web app's URL, plus everything above | Runs `apps/api` (Node 20 + Python 3 for the layout engine). Run `npx prisma migrate deploy` on release. |
| **Web host** (Vercel, Netlify or Cloudflare Pages) | https://vercel.com | build settings: `VITE_API_URL` = the API's URL (e.g. `https://api.heyjenna.app`; default `/api`, the dev proxy), and add the web app's URL to the API's `CORS_ORIGINS`. Instead of `VITE_API_URL` you can rewrite `/api/*` to the API host (prefix stripped). See `apps/web/.env.example` | Serves `apps/web` (`npm run build -w @hey-jenna/web` → `apps/web/dist`). Single-page app: send unknown paths to `index.html` |
| **Render worker** (GPU: Modal or RunPod) | https://modal.com · https://www.runpod.io | `API_URL` = the API's URL, `WORKER_TOKEN` (same as the API's), optional `SAMPLES`, `PCT`, `BLENDER_BIN` | Runs Blender 4.2+ for photo-real renders. Without it, render jobs stay "queued"; the live 3D room still works. |
| **`WORKER_TOKEN`** | make it yourself: `openssl rand -hex 32` | `WORKER_TOKEN` | Shared secret between the API and the render worker |

## The desktop app

Build an unsigned Mac app with `npm run dist -w @hey-jenna/desktop` (a `.dmg` in `apps/desktop/release`;
macOS warns on first open: right-click → Open; signing needs an Apple Developer account, $99/year).
It needs no keys of its own: point it at the hosted API with `HJ_API_URL` or `apiUrl` in its
`config.json`. Renders still go through the API to the render worker (see `docs/how-it-works.md`).
Login in the desktop app is not checked yet: the email link and Google send the user back to a web
URL, not to the app's `hj://studio/` page, so for now build it without `VITE_SUPABASE_*`.

## Optional product sources

| Service | Get it at | Env vars | Adds |
|---|---|---|---|
| IKEA | nothing to sign up for | `IKEA_LOCALE` (default `ca/en`) | Products + real 3D models. On by default. |
| Brave Search API | https://api-dashboard.search.brave.com | `BRAVE_SEARCH_API_KEY` | Kijiji and Facebook Marketplace listings (search results only, no scraping); Etsy fallback |
| eBay | https://developer.ebay.com/my/keys | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_MARKETPLACE` (default `EBAY_CA`) | eBay listings |
| Etsy | https://www.etsy.com/developers/register | `ETSY_API_KEY` | Etsy listings with images |

`SOURCES` picks which sources run (default `ikea,ebay,etsy,web`); each one only switches on when its keys are set.

**Pinterest needs no key or API approval:** the studio opens pinterest.com in a window beside it and
users drag or paste pins onto a moodboard.

## Prices

Free tiers cover a demo for Supabase, Vercel, Brave and eBay. Expect roughly $5–10 a month for an
always-on API host, pay-per-use for Anthropic, and pay-per-GPU-second for the render worker.
Check each provider's pricing page before paying; these numbers are estimates.
