/**
 * Studio preload: `window.heyJennaDesktop` (see apps/web/src/app/desktopBridge.ts). Narrow on purpose:
 * report where the Pinterest tab body is, and hear pins / "open Pinterest" from the main process.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

type Rect = { x: number; y: number; width: number; height: number };
type Pin = { imageUrl: string; link?: string };

const listen = (channel: string, fn: (e: IpcRendererEvent, ...a: unknown[]) => void) => {
  ipcRenderer.on(channel, fn);
  return () => void ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('heyJennaDesktop', {
  setPinterestBounds: (r: Rect | null) =>
    ipcRenderer.send('pinterest:bounds', r ? { x: Number(r.x), y: Number(r.y), width: Number(r.width), height: Number(r.height) } : null),
  onAddPin: (cb: (pin: Pin) => void) =>
    listen('hj:add-pin', (_e, d) => {
      const p = d as Pin;
      cb({ imageUrl: String(p.imageUrl), link: p.link ? String(p.link) : undefined });
    }),
  onOpenPinterest: (cb: () => void) => listen('hj:open-pinterest', () => cb()),
});
