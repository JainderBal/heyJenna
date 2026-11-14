/**
 * The live 360° room viewer inside the "3D room" frame (the prototype's viewerFor(): dollhouse
 * cutaway, drag to turn, scroll to zoom, Spin / 3/4 / Top / Reset). It draws the room from its floor
 * plan and places the layout's objects: the real product model (GLB from
 * /api/rooms/:roomId/listings/:listingId/model) when the product has one, else a clay piece.
 *
 * It renders inside `.viewer` (position:absolute; inset:0), which the canvas leaves alone for
 * pointer and wheel events, so the viewer can own drag and zoom.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Layout, Room } from '../api/types';
import { createViewer, type Viewer, type ViewerScene, type ViewKey } from './viewer3d';

export interface RoomViewerProps {
  roomId: string;
  /** The room's newest layout, or null before "Lay out the room". */
  layout: Layout | null;
  /** The room itself (size, windows, doors) so an empty room can still be drawn. */
  room?: Room;
  /** Colours to paint with (moodboard palette, else the project's). */
  palette?: string[];
}

/** No room to hand: size the box around the layout's objects (else the prototype's 4.2 × 3.6). */
function planOf(room: Room | undefined, layout: Layout | null): ViewerScene['plan'] {
  if (room?.floorPlan) return room.floorPlan;
  let w = 4.2;
  let d = 3.6;
  for (const o of layout?.objects ?? []) {
    const r = Math.max(o.size.w, o.size.d) / 2;
    w = Math.max(w, o.position.x + r);
    d = Math.max(d, o.position.y + r);
  }
  return { width: w, depth: d };
}

export function RoomViewer({ roomId, layout, room, palette }: RoomViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [auto, setAuto] = useState(true);
  const [noGL, setNoGL] = useState(false);
  const planJson = JSON.stringify(planOf(room, layout));
  const plan = useMemo<ViewerScene['plan']>(() => JSON.parse(planJson), [planJson]);
  const palKey = (palette ?? []).join(',');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const v = createViewer(host, setAuto);
    if (!v) {
      setNoGL(true);
      return;
    }
    viewer.current = v;
    return () => {
      viewer.current = null;
      v.dispose();
    };
  }, []);

  useEffect(() => {
    viewer.current?.build({ roomId, plan, layout, palette: palette ?? [] });
    // palette by value: a new array with the same colours is not a rebuild
  }, [roomId, plan, layout, palKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const press = (k: ViewKey) => viewer.current?.view(k);
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  if (noGL) return <p className="muted" style={{ padding: 16 }}>3D needs WebGL.</p>;
  return (
    <div ref={hostRef} className="vhost" aria-label={`Live 3D model${room ? ` of the ${room.name.toLowerCase()}` : ''}. Drag to turn, scroll to zoom.`}>
      <span className="vhud">
        <i />
        360° · drag to turn · scroll to zoom
      </span>
      <div className="vbtns">
        <button type="button" className={auto ? 'on' : ''} title="Auto-rotate" onPointerDown={stop} onClick={() => press('auto')}>
          ⟳ Spin
        </button>
        <button type="button" onPointerDown={stop} onClick={() => press('iso')}>
          3/4
        </button>
        <button type="button" onPointerDown={stop} onClick={() => press('top')}>
          Top
        </button>
        <button type="button" onPointerDown={stop} onClick={() => press('reset')}>
          Reset
        </button>
      </div>
    </div>
  );
}
