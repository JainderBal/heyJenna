/**
 * The live 360° room viewer inside the "3D room" frame (the prototype's viewerFor(): dollhouse
 * cutaway, drag to turn, scroll to zoom, Spin / 3/4 / Top / Reset). It draws the room from its floor
 * plan and places the layout's objects: the real product model (GLB from
 * /api/rooms/:roomId/listings/:listingId/model) when the product has one, else a clay piece.
 *
 * Given a finished render's model (`render`) it can show that room instead (`mode="render"`), in the
 * same orbit; until the model has loaded, or if it fails, the live room stays on screen.
 *
 * With `editable` (live room only), a click picks a piece: drag it over the floor (5 cm steps), turn it
 * (±15°, 90°, R / Shift+R), or remove it (button, Delete). Each edit is saved through
 * PATCH / DELETE /rooms/:roomId/layouts/:layoutId/objects/:objectId; the API's refusals and warnings
 * show in a small hud, and a refused move snaps back.
 *
 * It renders inside `.viewer` (position:absolute; inset:0), which the canvas leaves alone for
 * pointer and wheel events, so the viewer can own drag and zoom.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { errorText } from '../api/client';
import { useDeleteLayoutObject, usePatchLayoutObject, type ObjectEdit } from '../api/hooks';
import type { EditResult, Layout, Room } from '../api/types';
import { shortTitle } from '../editor/model';
import { createViewer, draggable, type RenderModel, type Viewer, type ViewerScene, type ViewerHooks, type ViewKey, type ViewMode } from './viewer3d';

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
  /** Let the person move, turn and remove pieces in the live room. */
  editable?: boolean;
}

type Msg = { text: string; error: boolean } | null;

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

export function RoomViewer({ roomId, layout, room, palette, render = null, mode = 'live', onRenderState, editable = false }: RoomViewerProps) {
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

  // editing
  const [selId, setSelId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [rebuild, setRebuild] = useState(0);
  const patch = usePatchLayoutObject(roomId, layout?.id ?? '');
  const del = useDeleteLayoutObject(roomId, layout?.id ?? '');
  const busy = patch.isPending || del.isPending;
  const sel = layout?.objects.find((o) => o.id === selId) ?? null;
  const done = (r: EditResult) => setMsg(r.warnings.length ? { text: r.warnings.join(' · ').replace(/_/g, ' '), error: false } : null);
  const failed = (e: unknown) => {
    setMsg({ text: errorText(e), error: true });
    setRebuild((n) => n + 1); // put the piece back where the layout has it
  };
  function edit(objectId: string, e: ObjectEdit) {
    if (!layout) return;
    patch.mutate({ objectId, edit: e }, { onSuccess: done, onError: failed });
  }
  function turn(by: number) {
    if (!sel || busy || !draggable(sel)) return;
    const deg = ((((sel.rotation_deg ?? 0) + by) % 360) + 360) % 360;
    viewer.current?.pose(sel.id, deg);
    edit(sel.id, { rotationDeg: deg });
  }
  function remove() {
    if (!sel || busy) return;
    const id = sel.id;
    del.mutate(id, {
      onSuccess: (r) => {
        setSelId(null);
        done(r);
      },
      onError: failed,
    });
  }
  // the viewer is made once; its callbacks reach the latest render through this ref
  const handlers = useRef<Pick<ViewerHooks, 'onPick' | 'onDrop'>>({});
  handlers.current = {
    onPick: (id) => {
      setSelId(id);
      setMsg(null);
    },
    onDrop: (id, x, y) => edit(id, { x, y }),
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const v = createViewer(host, {
      onAuto: setAuto,
      onPick: (id) => handlers.current.onPick?.(id),
      onDrop: (id, x, y) => handlers.current.onDrop?.(id, x, y),
    });
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
  }, [roomId, plan, layout, palKey, rebuild]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const canEdit = editable && showing === 'live' && !!layout;
  const shownSel = canEdit ? (sel?.id ?? null) : null;
  useEffect(() => {
    viewer.current?.setEditable(canEdit);
  }, [canEdit]);
  useEffect(() => {
    viewer.current?.select(shownSel);
  }, [shownSel]);

  // keys while a piece is picked: R / Shift+R turn it 90°, Delete removes it, Escape lets go
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (!shownSel || (e.target as HTMLElement).closest?.('input,textarea,[contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'r' || e.key === 'R') turn(e.shiftKey ? -90 : 90);
    else if (e.key === 'Delete' || e.key === 'Backspace') remove();
    else if (e.key === 'Escape') setSelId(null);
    else return;
    e.preventDefault();
    e.stopPropagation(); // keep the editor's own shortcuts (R = rectangle tool) out of it
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, []);

  const press = (k: ViewKey) => viewer.current?.view(k);
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  if (noGL) return <p className="muted" style={{ padding: 16 }}>3D needs WebGL.</p>;
  return (
    <div ref={hostRef} className="vhost" aria-label={`${showing === 'render' ? 'Rendered' : 'Live'} 3D model${room ? ` of the ${room.name.toLowerCase()}` : ''}. Drag to turn, scroll to zoom.${canEdit ? ' Click a piece to move, turn or remove it.' : ''}`}>
      {mode === 'render' && renderState === 'loading' && (
        <span className="vhud">
          <i />
          loading the render…
        </span>
      )}
      {canEdit && sel && (
        <div className="vedit" onPointerDown={stop}>
          <b title={sel.product?.title ?? sel.type}>{sel.product ? shortTitle(sel.product.title) : sel.type.replace(/_/g, ' ')}</b>
          {draggable(sel) && (
            <>
              <button type="button" disabled={busy} title="Turn 15° left" onClick={() => turn(-15)}>
                ⟲ 15°
              </button>
              <button type="button" disabled={busy} title="Turn 15° right" onClick={() => turn(15)}>
                ⟳ 15°
              </button>
              <button type="button" disabled={busy} title="Turn 90° (R)" onClick={() => turn(90)}>
                90°
              </button>
            </>
          )}
          <button type="button" className="danger" disabled={busy} title="Remove (Delete)" onClick={remove}>
            Remove
          </button>
        </div>
      )}
      {canEdit && msg && (
        <span className={`vmsg${msg.error ? ' err' : ''}`} role={msg.error ? 'alert' : 'status'}>
          {msg.text}
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
