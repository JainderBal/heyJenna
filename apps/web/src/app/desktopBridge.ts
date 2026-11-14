/**
 * The hey jenna desktop app (apps/desktop) exposes `window.heyJennaDesktop` through its preload.
 * On the web it's undefined and nothing here does anything: Pinterest stays a pop-up window.
 */
export type PinterestRect = { x: number; y: number; width: number; height: number };
export type DesktopPin = { imageUrl: string; link?: string };

export interface DesktopBridge {
  /** Where the Pinterest view goes (CSS px in this page), or null to hide it. */
  setPinterestBounds(rect: PinterestRect | null): void;
  /** "+ Add to moodboard" clicked on a pin in the Pinterest view. Returns an unsubscribe. */
  onAddPin(cb: (pin: DesktopPin) => void): () => void;
  /** Something asked for pinterest.com (e.g. the studio's "Open Pinterest" pop-up). Returns an unsubscribe. */
  onOpenPinterest(cb: () => void): () => void;
}

declare global {
  interface Window {
    heyJennaDesktop?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = typeof window !== 'undefined' ? window.heyJennaDesktop : undefined;
