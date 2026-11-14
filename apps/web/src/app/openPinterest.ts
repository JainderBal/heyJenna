import { toast } from './useEditorStore';

const SEEN_KEY = 'hj-pinterest-hint';

/** Opens pinterest.com in its own window docked to the right of the studio (or at the screen's right edge). */
export function openPinterestWindow() {
  const w = 480;
  const scr = window.screen as Screen & { availLeft?: number; availTop?: number };
  const sl = scr.availLeft ?? 0;
  const right = window.screenX + window.outerWidth;
  const left = right + w <= sl + scr.availWidth ? right : Math.max(sl, sl + scr.availWidth - w);
  const h = Math.min(window.outerHeight || scr.availHeight, scr.availHeight);
  const win = window.open('https://www.pinterest.com/', 'hj-pinterest', `popup=yes,width=${w},height=${h},left=${left},top=${window.screenY}`);
  if (!win) return toast('Allow pop-ups to open Pinterest beside the studio');
  try {
    win.opener = null;
  } catch {
    /* cross-origin already */
  }
  win.focus();
  let seen = false;
  try {
    seen = !!localStorage.getItem(SEEN_KEY);
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode: hint every time */
  }
  if (!seen) toast('Drag or paste any pin onto a moodboard');
}
