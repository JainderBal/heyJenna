/**
 * The live 360° room viewer inside the "3D room" frame (the prototype's viewerFor(): dollhouse
 * cutaway, drag to turn, scroll to zoom, Spin / 3/4 / Top / Reset). It draws the room from its floor
 * plan and places the layout's objects: the real product model (GLB from
 * /api/rooms/:roomId/listings/:listingId/model) when the product has one, else a clay piece.
 *
 * Given a finished render's model (`render`) it can show that room instead (`mode="render"`), in the
 * same orbit; until the model has loaded, or if it fails, the live room stays on screen.
 *
 * It renders inside `.viewer` (position:absolute; inset:0), which the canvas leaves alone for
 * pointer and wheel events, so the viewer can own drag and zoom.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Layout, Room } from '../api/types';
import { createViewer, type RenderModel, type Viewer, type ViewerScene, type ViewKey, type ViewMode } from './viewer3d';

export type RenderModelState = 'none' | 'loading' | 'ready' | 'error';

export interface RoomViewerProps {
  roomId: string;
  /** The room's newest layout, or null before "Lay out the room". */
  layout: Layout | null;
  /** The room itself (size, windows, doors) so an empty room can still be drawn. */
  room?: Room;
  /** Colours to paint with (moodboard palette, else the project's). */
  palette?: string[];
  /** A finished render's room model to have ready (null: none). */
  render?: RenderModel | null;
  /** Which room to show; 'render' falls back to live until the render's model is ready. */
  mode?: ViewMode;
  /** Tells the frame how the render's model is getting on. */
  onRenderState?: (s: RenderModelState) => void;
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

export function RoomViewer({ roomId, layout, room, palette, render = null, mode = 'live', onRenderState }: RoomViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [auto, setAuto] = useState(true);
  const [noGL, setNoGL] = useState(false);
  const planJson = JSON.stringify(planOf(room, layout));
  const plan = useMemo<ViewerScene['plan']>(() => JSON.parse(planJson), [planJson]);
  const palKey = (palette ?? []).join(',');
  const [renderState, setRenderState] = useState<RenderModelState>('none');
  const stateCb = useRef(onRenderState);
  stateCb.current = onRenderState;
  const renderJob = render?.jobId ?? '';
  const renderPath = render?.path ?? '';

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

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    let live = true;
    const set = (s: RenderModelState) => {
      if (!live) return;
      setRenderState(s);
      stateCb.current?.(s);
    };
    if (!renderJob) {
      v.setRender(null);
      set('none');
      return;
    }
    set('loading');
    v.setRender({ jobId: renderJob, path: renderPath }).then(
      () => set('ready'),
      () => set('error'),
    );
    return () => {
      live = false;
    };
  }, [renderJob, renderPath]);

  const showing: ViewMode = mode === 'render' && renderState === 'ready' ? 'render' : 'live';
  useEffect(() => {
    viewer.current?.setMode(showing);
  }, [showing]);

  const press = (k: ViewKey) => viewer.current?.view(k);
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  if (noGL) return <p className="muted" style={{ padding: 16 }}>3D needs WebGL.</p>;
  return (
    <div ref={hostRef} className="vhost" aria-label={`${showing === 'render' ? 'Rendered' : 'Live'} 3D model${room ? ` of the ${room.name.toLowerCase()}` : ''}. Drag to turn, scroll to zoom.`}>
      {mode === 'render' && renderState === 'loading' && (
        <span className="vhud">
          <i />
          loading the render…
        </span>
      )}
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
