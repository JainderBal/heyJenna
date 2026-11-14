/**
 * hey jenna desktop: one window with the studio; pinterest.com lives in the studio's side panel as a tab.
 *
 * Views (both sandboxed, context-isolated, no Node):
 *   studio    the React studio, filling the window. Dev: http://localhost:5173. Packaged: apps/web/dist served on hj://studio,
 *             where hj://studio/api/* is forwarded to the API URL (prefix stripped, like Vite's proxy).
 *   pinterest pinterest.com in the persistent "persist:pinterest" session, laid over the studio's Pinterest
 *             tab body (the studio reports its bounds through the preload) and hidden otherwise.
 */
import { app, BaseWindow, ipcMain, net, protocol, screen, session, shell, WebContentsView, type WebContents } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEME = 'hj';
const STUDIO_HOST = 'studio';

const isDev = !app.isPackaged;
const DEV_WEB_URL = process.env.HJ_WEB_URL || 'http://localhost:5173';
const PINTEREST_HOME = 'https://www.pinterest.com/';

/** API URL (packaged build): HJ_API_URL, else `apiUrl` in <userData>/config.json, else http://localhost:3000. */
function apiUrl(): string {
  if (process.env.HJ_API_URL) return process.env.HJ_API_URL.replace(/\/+$/, '');
  try {
    const cfg = JSON.parse(readFileSync(join(app.getPath('userData'), 'config.json'), 'utf8')) as { apiUrl?: unknown };
    if (typeof cfg.apiUrl === 'string' && cfg.apiUrl) return cfg.apiUrl.replace(/\/+$/, '');
  } catch {
    /* no config file */
  }
  return 'http://localhost:3000';
}

/** pinterest.com / www.pinterest.co.uk / … and the pinimg.com CDN. */
const isPinterestHost = (h: string) => /(^|\.)pinterest\.(com|[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/i.test(h) || /(^|\.)pinimg\.com$/i.test(h);
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
};
const openExternal = (u: string) => {
  if (/^https?:\/\//i.test(u)) void shell.openExternal(u);
};

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

/** Packaged build: serve apps/web/dist on hj://studio and forward /api/* to the API. */
function registerStudioProtocol() {
  const webRoot = join(process.resourcesPath, 'web');
  const api = apiUrl();
  console.log(`[hj] studio from ${webRoot}, /api → ${api}`);
  protocol.handle(SCHEME, async (req) => {
    const url = new URL(req.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const target = api + url.pathname.slice(4) + url.search;
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      return net.fetch(target, {
        method: req.method,
        headers: req.headers,
        body: hasBody ? req.body : undefined,
        // @ts-expect-error duplex is needed for streamed request bodies (undici), not in the DOM types
        duplex: hasBody ? 'half' : undefined,
      });
    }
    let file = normalize(join(webRoot, decodeURIComponent(url.pathname)));
    if (!file.startsWith(webRoot + sep) || !existsSync(file) || url.pathname === '/') file = join(webRoot, 'index.html'); // SPA routes
    return net.fetch(pathToFileURL(file).toString());
  });
}

const webPrefs = (preload: string, partition?: string) => ({
  preload: join(__dirname, preload),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  partition,
});

function createWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const win = new BaseWindow({ width: Math.min(1600, area.width), height: Math.min(1000, area.height), minWidth: 900, minHeight: 600, title: 'hey jenna' });
  const studio = new WebContentsView({ webPreferences: webPrefs('preload-studio.js') });
  const pinterest = new WebContentsView({ webPreferences: webPrefs('preload-pinterest.js', 'persist:pinterest') });
  win.contentView.addChildView(studio);
  win.contentView.addChildView(pinterest); // on top, placed over the studio's Pinterest tab body
  pinterest.setVisible(false);

  const fit = () => {
    const { width, height } = win.getContentBounds();
    studio.setBounds({ x: 0, y: 0, width, height });
  };
  win.on('resize', fit);
  fit();

  // ── the studio reports where its Pinterest tab body is (CSS px), or null when the tab isn't shown
  ipcMain.on('pinterest:bounds', (e, r: unknown) => {
    if (e.sender !== studio.webContents) return;
    const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
    const b = r as { x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null;
    if (!b || !ok(b.x) || !ok(b.y) || !ok(b.width) || !ok(b.height) || b.width < 1 || b.height < 1) return pinterest.setVisible(false);
    const z = studio.webContents.getZoomFactor(); // CSS px → window px
    pinterest.setBounds({ x: Math.round(b.x * z), y: Math.round(b.y * z), width: Math.round(b.width * z), height: Math.round(b.height * z) });
    pinterest.setVisible(true);
  });

  // ── studio
  const studioUrl = isDev ? DEV_WEB_URL : `${SCHEME}://${STUDIO_HOST}/`;
  const studioOrigin = new URL(studioUrl).origin;
  studio.webContents.setWindowOpenHandler(({ url }) => {
    if (!isPinterestHost(hostOf(url))) {
      openExternal(url);
      return { action: 'deny' };
    }
    // the studio's "Open Pinterest" pop-up: open the Pinterest side panel tab instead. The pop-up is
    // allowed (hidden, destroyed at once) so window.open() isn't null and the studio doesn't ask to allow pop-ups.
    studio.webContents.send('hj:open-pinterest');
    if (url.replace(/\/$/, '') !== PINTEREST_HOME.replace(/\/$/, '')) void pinterest.webContents.loadURL(url);
    return { action: 'allow', overrideBrowserWindowOptions: { show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } } };
  });
  studio.webContents.on('did-create-window', (w) => w.destroy());
  studio.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).origin !== studioOrigin) {
      e.preventDefault();
      openExternal(url);
    }
  });
  studio.webContents.on('did-start-navigation', (d) => {
    if (d.isMainFrame && !d.isSameDocument) pinterest.setVisible(false); // studio reload: the tab reports again
  });

  // ── pinterest: pinterest domains only, everything else in the default browser, no permissions
  const pin = pinterest.webContents;
  pin.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  pin.setWindowOpenHandler(({ url }) => {
    if (isPinterestHost(hostOf(url))) void pin.loadURL(url);
    else openExternal(url);
    return { action: 'deny' };
  });
  const guard = (e: Electron.Event, url: string) => {
    if (!isPinterestHost(hostOf(url))) {
      e.preventDefault();
      openExternal(url);
    }
  };
  pin.on('will-navigate', guard);
  pin.on('will-redirect', guard);
  pin.on('will-frame-navigate', (e) => {
    if (!e.isMainFrame && !isPinterestHost(hostOf(e.url))) e.preventDefault();
  });

  // ── "+ Add to moodboard": pinterest preload → main → studio preload → the studio adds it to the open room
  ipcMain.on('pin:add', (e, d: unknown) => {
    if (e.sender !== pin) return;
    const { imageUrl, link } = (d ?? {}) as { imageUrl?: unknown; link?: unknown };
    if (typeof imageUrl !== 'string' || !/^https:\/\/i\.pinimg\.com\/\S+$/.test(imageUrl)) return;
    const okLink = typeof link === 'string' && /^https:\/\//.test(link) && isPinterestHost(hostOf(link)) ? link : undefined;
    studio.webContents.send('hj:add-pin', { imageUrl, link: okLink });
  });

  const logLoad = (name: string, wc: WebContents) => {
    wc.on('did-finish-load', () => console.log(`[hj] ${name} loaded ${wc.getURL()}`));
    wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
      if (isMain) console.error(`[hj] ${name} failed to load ${url}: ${desc} (${code})`);
    });
  };
  logLoad('studio', studio.webContents);
  logLoad('pinterest', pin);

  void studio.webContents.loadURL(studioUrl);
  void pin.loadURL(PINTEREST_HOME);
}

app.whenReady().then(() => {
  if (!isDev) registerStudioProtocol();
  // narrow the default session too: the studio needs no device permissions
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'clipboard-sanitized-write'));
  createWindow();
});
app.on('window-all-closed', () => app.quit());
