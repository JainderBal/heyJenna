# desktop

The hey jenna studio as a Mac app. One window with the studio; the real pinterest.com opens as a
**Pinterest tab in the studio's side panel**, next to jenna and Shopping list (rail → Pinterest, or the
moodboard's "Open Pinterest"). Electron, TypeScript, built with `tsc` (type-check) + `esbuild`.

## Run it

```bash
npm run dev       # API on :3000
npm run web       # studio on :5173
npm run desktop   # this app (= npm run dev -w @hey-jenna/desktop), loads http://localhost:5173
```

```bash
npm run build -w @hey-jenna/desktop   # type-check + bundle into apps/desktop/dist
npm run dist -w @hey-jenna/desktop    # builds apps/web too, then an unsigned .dmg in apps/desktop/release
```

## How it finds the API

- **Dev:** the studio comes from the Vite dev server (`HJ_WEB_URL`, default `http://localhost:5173`), which
  proxies `/api` to the API as usual.
- **Packaged:** the built `apps/web/dist` is served on `hj://studio/`, and `hj://studio/api/*` is forwarded
  to the API with the `/api` prefix stripped (same as Vite's proxy), so the web app is unchanged. The API URL
  is `HJ_API_URL`, else `apiUrl` in `~/Library/Application Support/@hey-jenna/desktop/config.json`
  (`{ "apiUrl": "https://api.example.com" }`), else `http://localhost:3000`.

Renders still come from the render worker (`npm run worker`); the app doesn't run Blender itself.

## Pinterest tab

- The studio (only when `window.heyJennaDesktop` exists, so the web version is unchanged) shows an empty
  Pinterest tab body and reports its position; the app lays a pinterest.com view exactly over it while the
  tab is open and active, and hides it otherwise (`apps/web/src/sidepanel/PinterestPanel.tsx`).
- Its own persistent session (`persist:pinterest`), so the Pinterest login survives restarts.
- Only pinterest domains and `pinimg.com` open in the pane; other links open in your default browser.
- Hover a pin image for **+ Add to moodboard**: it adds the pin (the `/736x/` image and its pin link) to the
  room page open in the studio (on the Floor plan page it asks you to open a room). Dragging a pin onto a moodboard still works too.

Both views run with `contextIsolation`, `sandbox` and no Node. The studio preload exposes only
`window.heyJennaDesktop` (`setPinterestBounds`, `onAddPin`, `onOpenPinterest`; see
`apps/web/src/app/desktopBridge.ts`); the Pinterest preload exposes nothing to the page.

## Unsigned app

The `.dmg` is not signed or notarised. The first time, right-click the app → **Open** → **Open** (or allow
it in System Settings → Privacy & Security).
