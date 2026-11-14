# Production setup: accounts and keys

Everything runs locally with **no accounts** (local Postgres, `AUTH_MODE=dev`, local file storage,
IKEA products and 3D models). This page is what you need to put hey jenna online.

Put API values in `apps/api/.env` locally, and in your host's environment settings in production.
Never commit real keys. Keep the Supabase service-role key and `WORKER_TOKEN` server-side only.

## Required for production

| Service | Get it at | Env vars | Used for |
|---|---|---|---|
| **Supabase** (one project) | https://supabase.com/dashboard | `DATABASE_URL` (Project Settings → Database → connection string), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` (default `moodboards`; create it in Storage). Set `AUTH_MODE=supabase` and `STORAGE_DRIVER=supabase`. `SUPABASE_JWT_SECRET` only for older projects that sign tokens with HS256. | Postgres, login, and file storage (moodboards, renders, cached 3D models) |
| **Anthropic** | https://console.anthropic.com/settings/keys | `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`, default `claude-opus-5-5`) | Reading the moodboard's style (without it only colours are read), jenna chat answers, reading a floor-plan photo (422 without it). Pay-as-you-go. |
| **API host** (Render, Railway or Fly) | https://dashboard.render.com · https://railway.com · https://fly.io | `PORT`, `CORS_ORIGINS` = the web app's URL, plus everything above | Runs `apps/api` (Node 20 + Python 3 for the layout engine). Run `npx prisma migrate deploy` on release. |
| **Web host** (Vercel, Netlify or Cloudflare Pages) | https://vercel.com | the web app needs the API's URL: today Vite proxies `/api` in dev, so production needs a rewrite of `/api/*` to the API host (or a `VITE_API_URL` setting, not built yet) | Serves `apps/web` (`npm run build -w @hey-jenna/web` → `apps/web/dist`) |
| **Render worker** (GPU: Modal or RunPod) | https://modal.com · https://www.runpod.io | `API_URL` = the API's URL, `WORKER_TOKEN` (same as the API's), optional `SAMPLES`, `PCT`, `BLENDER_BIN` | Runs Blender 4.2+ for photo-real renders. Without it, render jobs stay "queued"; the live 3D room still works. |
| **`WORKER_TOKEN`** | make it yourself: `openssl rand -hex 32` | `WORKER_TOKEN` | Shared secret between the API and the render worker |

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
