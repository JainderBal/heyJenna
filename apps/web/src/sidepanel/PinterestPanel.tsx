/**
 * Desktop app only: the Pinterest side panel tab. The body is an empty box; the desktop app lays its own
 * pinterest.com view (persistent login) exactly over it while the tab is shown. Pins added there with
 * "+ Add to moodboard" go to the open room's moodboard.
 */
import { useEffect, useRef } from 'react';
import { errorText } from '../api/client';
import { useAddMoodboardPins } from '../api/hooks';
import { desktop } from '../app/desktopBridge';
import { toast, useEditorStore } from '../app/useEditorStore';

export function PinterestPanel() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!desktop || !el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      desktop!.setPinterestBounds(r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, width: r.width, height: r.height } : null);
    };
    const ro = new ResizeObserver(report); // also fires when the tab is hidden (size → 0) or shown
    ro.observe(el);
    window.addEventListener('resize', report);
    window.addEventListener('scroll', report, true);
    report();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', report);
      window.removeEventListener('scroll', report, true);
      desktop!.setPinterestBounds(null);
    };
  }, []);
  return <div ref={ref} style={{ position: 'absolute', inset: 0, background: '#fff' }} />;
}

/** Desktop app: adds pins from the Pinterest tab to the open room, and opens the tab when Pinterest is asked for. */
export function useDesktopPins(roomId: string | undefined) {
  const addPins = useAddMoodboardPins(roomId ?? '');
  const live = useRef({ roomId, addPins });
  live.current = { roomId, addPins };

  useEffect(() => {
    if (!desktop) return;
    const offPin = desktop.onAddPin(({ imageUrl, link }) => {
      const { roomId: id, addPins: add } = live.current;
      if (!id) return toast('Open a room page to add pins to its moodboard');
      const name = (imageUrl.split('/').pop() || String(Date.now())).replace(/\.\w+$/, '');
      add.mutate([{ id: `pin-${name}`.slice(0, 64), imageUrl, link }], {
        onSuccess: () => toast('Pin added to the moodboard'),
        onError: (er) => toast(errorText(er)),
      });
    });
    const offOpen = desktop.onOpenPinterest(() => useEditorStore.getState().spOpen('pinterest'));
    return () => {
      offPin();
      offOpen();
    };
  }, []);
}
