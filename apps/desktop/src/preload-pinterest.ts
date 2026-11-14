/**
 * Pinterest preload: a "+ Add to moodboard" button over the pin image under the mouse (i.pinimg.com).
 * Clicking it sends { imageUrl (the /736x/ size), link (the pin page, if found) } to the main process.
 * Runs in the isolated world; the page can't reach ipcRenderer. Dragging images still works as before.
 */
import { ipcRenderer } from 'electron';

const MIN_SIZE = 120;
const upgrade = (src: string) => src.replace(/\/(?:\d+x\d*(?:_RS)?|originals)\//, '/736x/');

let host: HTMLDivElement | null = null;
let btn: HTMLButtonElement | null = null;
let current: HTMLImageElement | null = null;

function ensureButton() {
  if (host) return;
  host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;display:none;top:0;left:0';
  const root = host.attachShadow({ mode: 'closed' });
  btn = document.createElement('button');
  btn.textContent = '+ Add to moodboard';
  btn.style.cssText =
    'font:600 13px -apple-system,system-ui,sans-serif;padding:7px 12px;border:0;border-radius:999px;' +
    'background:#111;color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!current || !btn) return;
    const src = current.currentSrc || current.src;
    const a = current.closest('a[href*="/pin/"]') as HTMLAnchorElement | null;
    const link = a?.href || (/\/pin\/\d+/.test(location.pathname) ? location.origin + location.pathname : undefined);
    ipcRenderer.send('pin:add', { imageUrl: upgrade(src), link });
    btn.textContent = 'Added ✓';
    setTimeout(() => btn && (btn.textContent = '+ Add to moodboard'), 1200);
  });
  root.appendChild(btn);
  document.documentElement.appendChild(host);
}

const hide = () => {
  if (host) host.style.display = 'none';
  current = null;
};

function pinImage(t: EventTarget | null): HTMLImageElement | null {
  if (!(t instanceof Element)) return null;
  // Pinterest often lays a transparent overlay over the image: look under it inside the same pin
  const img = t instanceof HTMLImageElement ? t : t.closest('[data-test-id="pin"], [data-grid-item], a[href*="/pin/"]')?.querySelector('img');
  if (!(img instanceof HTMLImageElement)) return null;
  const src = img.currentSrc || img.src;
  if (!/^https:\/\/i\.pinimg\.com\//.test(src)) return null;
  const r = img.getBoundingClientRect();
  return r.width >= MIN_SIZE && r.height >= MIN_SIZE ? img : null;
}

window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener(
    'mouseover',
    (e) => {
      if (host && e.target === host) return;
      const img = pinImage(e.target);
      if (!img) return hide();
      ensureButton();
      current = img;
      const r = img.getBoundingClientRect();
      host!.style.top = `${Math.max(r.top, 0) + 10}px`;
      host!.style.left = `${Math.max(Math.min(r.left, innerWidth - 170), 0) + 10}px`;
      host!.style.display = 'block';
    },
    true,
  );
  window.addEventListener('scroll', hide, true);
});
