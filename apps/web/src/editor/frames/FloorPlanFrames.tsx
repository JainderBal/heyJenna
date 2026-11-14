/**
 * Floor plan page frames (the prototype's Plan, 3D floor plan, Rooms found):
 *  - plan: the rooms drawn to scale; drag a room to move it (saved to the API as its planPosition,
 *    debounced after the drop). With no rooms yet, or after "+ Add rooms", it holds the intake:
 *    read a plan photo (POST /projects/:id/floor-plan) → preview → "Create these rooms"; on 422 (no
 *    ANTHROPIC_API_KEY on the API, or no rooms found) → "Draw rooms" by hand, or the sample plan.
 *  - plan3d: the whole plan as an isometric clay model (the prototype's planShot).
 *  - found: one row per room → its page, with that room's budget; "Furnish every room" finds products and lays
 *    out each room that has a budget; "+ Add rooms".
 * Every room (bedrooms, bathrooms, halls, closets, balconies…) gets a page; a room turned off (furnish = false)
 * stays on the plan only.
 */
import { useMemo, useRef, useState } from 'react';
import type { BulkRoomInput, FloorPlan, PlanPosition } from '@hey-jenna/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { qk, useBulkCreateRooms, usePlanPositionSaver, useProjectSpend, useReadFloorPlan } from '../../api/hooks';
import { api, errorText, isApiError } from '../../api/client';
import type { DetectedRoom, Room } from '../../api/types';
import { PlanReview } from './PlanReview';
import { toast, useEditorStore } from '../../app/useEditorStore';
import { PlanDrop } from '../icons';
import { PLANS, floorPlanOf, placeRooms, sampleRooms, snapPlan, type PlacedRoom } from '../plans';
import { useMoveLegacyPlanSpots } from '../useLegacyPlanSpots';
import { shade } from '../colour';
import { planShot, planShotMap, shotKind } from '../../viewer/three-kit';
import { RoomBudget } from '../BudgetSlider';
import { shortName } from './PlanReview';

/** Walls that open onto the next room (open-plan). */
const openOf = (plan: FloorPlan) => Object.entries(plan.walls ?? {}).filter(([, f]) => f?.open).map(([w]) => w);

type Mode =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'preview'; rooms: DetectedRoom[]; warnings: string[] }
  | { kind: 'draw'; reason?: string };

interface DraftRoom {
  name: string;
  width: number;
  depth: number;
}

/** The Plan frame's intake: the empty page's "Drop your floor plan", or "Add rooms" (closed with `onClose`). */
function RoomsIntake({ projectId, empty, onClose }: { projectId: string; empty: boolean; onClose?: () => void }) {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [drafts, setDrafts] = useState<DraftRoom[]>([]);
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const read = useReadFloorPlan(projectId);
  const bulk = useBulkCreateRooms(projectId);
  const setPlanUpload = useEditorStore((s) => s.setPlanUpload);
  const upload = useEditorStore((s) => s.planUploads[projectId]);
  const goPage = useEditorStore((s) => s.goPage);

  function readPlan(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('That is not an image');
    setPlanUpload(projectId, URL.createObjectURL(f));
    setMode({ kind: 'reading' });
    read.mutate(
      { file: f },
      {
        onSuccess: (r) => setMode({ kind: 'preview', rooms: r.rooms, warnings: r.warnings }),
        onError: (e) => {
          if (isApiError(e, 422)) setMode({ kind: 'draw', reason: e.message });
          else {
            setMode({ kind: 'idle' });
            toast(errorText(e));
          }
        },
      },
    );
  }

  function create(rooms: BulkRoomInput[]) {
    bulk.mutate(rooms, {
      onSuccess: (created: Room[]) => {
        setMode({ kind: 'idle' });
        setDrafts([]);
        onClose?.();
        toast(`jenna found ${created.length} rooms and made a page for each`);
        goPage('plan');
      },
      onError: (e) => toast(errorText(e)),
    });
  }

  const busy = read.isPending || bulk.isPending;
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      readPlan(e.dataTransfer.files[0]);
    },
  };
  const sample = () => create(sampleRooms(PLANS.flat));
  const input = <input ref={file} type="file" accept="image/*" hidden onChange={(e) => (readPlan(e.target.files?.[0]), (e.target.value = ''))} />;

  if (mode.kind === 'preview') {
    return (
      <PlanReview
        image={upload}
        rooms={mode.rooms}
        warnings={mode.warnings}
        busy={busy}
        creating={bulk.isPending}
        onToggle={(i) => setMode({ ...mode, rooms: mode.rooms.map((x, j) => (j === i ? { ...x, furnish: !x.furnish } : x)) })}
        onCancel={() => setMode({ kind: 'idle' })}
        onCreate={() =>
          create(
            mode.rooms.map((r) => ({
              name: r.name, floorPlan: r.floorPlan, needs: [], planPosition: { x: r.position.x, y: r.position.y }, kind: r.kind, furnish: r.furnish,
            })),
          )
        }
      />
    );
  }

  if (mode.kind === 'draw') {
    return (
      <div className="addf">
        <h3>Draw rooms</h3>
        <p>{mode.reason ? `${mode.reason}.` : 'Give each room a name and its size in metres.'}</p>
        <DrawForm onAdd={(d) => setDrafts((x) => [...x, d])} />
        {drafts.length > 0 && (
          <ul>
            {drafts.map((d, i) => (
              <li key={i}>
                <span>{d.name}</span>
                <small>
                  {d.width} × {d.depth} m{' '}
                  <button type="button" className="link" onClick={() => setDrafts((x) => x.filter((_, k) => k !== i))} aria-label={`Remove ${d.name}`}>
                    remove
                  </button>
                </small>
              </li>
            ))}
          </ul>
        )}
        <div className="acts">
          <button
            className="pbtn dark"
            type="button"
            disabled={busy || !drafts.length}
            onClick={() =>
              create(drafts.map((d) => ({ name: d.name, needs: [], floorPlan: floorPlanOf(d.width, d.depth) })))
            }
          >
            {bulk.isPending ? 'Creating…' : `Create ${drafts.length || ''} room${drafts.length === 1 ? '' : 's'}`}
          </button>
          <button className="pbtn" type="button" disabled={busy} onClick={sample}>
            Use sample plan
          </button>
          <button className="pbtn" type="button" disabled={busy} onClick={() => setMode({ kind: 'idle' })}>
            Back
          </button>
        </div>
      </div>
    );
  }

  // idle / reading
  if (empty) {
    return (
      <div className="dropf" {...dropProps} style={over ? { borderColor: 'var(--select)' } : undefined}>
        {input}
        <PlanDrop />
        <h3>{mode.kind === 'reading' ? 'Reading your plan…' : 'Drop your floor plan'}</h3>
        <p>a photo of the plan from your lease, or a sketch. jenna builds it in 3D and makes a page for every room.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="pbtn dark" type="button" disabled={busy} onClick={() => file.current?.click()}>
            Upload plan
          </button>
          <button className="pbtn" type="button" disabled={busy} onClick={() => setMode({ kind: 'draw' })}>
            Draw rooms
          </button>
          <button className="pbtn" type="button" disabled={busy} onClick={sample}>
            Use a sample
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="addf" {...dropProps} style={over ? { boxShadow: 'inset 0 0 0 2px var(--select)' } : undefined}>
      {input}
      <h3>{mode.kind === 'reading' ? 'Reading your plan…' : 'Add rooms'}</h3>
      <p>Drop another plan photo here to add the rooms on it, or draw rooms by hand.</p>
      <div className="acts">
        <button className="pbtn dark" type="button" disabled={busy} onClick={() => file.current?.click()}>
          Upload plan
        </button>
        <button className="pbtn" type="button" disabled={busy} onClick={() => setMode({ kind: 'draw' })}>
          Draw rooms
        </button>
        <button className="pbtn" type="button" disabled={busy} onClick={sample}>
          Use sample plan
        </button>
        {onClose && (
          <button className="pbtn" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function DrawForm({ onAdd }: { onAdd: (d: DraftRoom) => void }) {
  const [name, setName] = useState('');
  const [w, setW] = useState('4');
  const [d, setD] = useState('3.5');
  const ok = (v: string) => Number(v) >= 1.5 && Number(v) <= 30;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return toast('Give the room a name');
        if (!ok(w) || !ok(d)) return toast('Sizes are 1.5 to 30 m');
        onAdd({ name: name.trim(), width: Number(w), depth: Number(d) });
        setName('');
      }}
    >
      <input placeholder="Living room" value={name} onChange={(e) => setName(e.target.value)} aria-label="Room name" maxLength={120} />
      <input type="number" step="0.1" min="1.5" max="30" value={w} onChange={(e) => setW(e.target.value)} aria-label="Width (m)" />
      <span className="x">×</span>
      <input type="number" step="0.1" min="1.5" max="30" value={d} onChange={(e) => setD(e.target.value)} aria-label="Depth (m)" />
      <button className="pbtn" type="submit">
        Add
      </button>
    </form>
  );
}

/** The plan drawn to scale (the prototype's `plan` frame). Rooms are clickable → their page. */
export function PlanFrame({ projectId, rooms, palette, upload }: { projectId: string; rooms: Room[]; palette: string[]; upload?: string }) {
  const adding = useEditorStore((s) => s.addingRooms === projectId);
  const setAdding = useEditorStore((s) => s.setAddingRooms);
  const body = !rooms.length ? (
    <RoomsIntake projectId={projectId} empty />
  ) : adding ? (
    <RoomsIntake projectId={projectId} empty={false} onClose={() => setAdding(null)} />
  ) : (
    <PlanDrawing projectId={projectId} rooms={rooms} palette={palette} upload={upload} />
  );
  return (
    <div className="plan-frame">
      <div className="plan-body">{body}</div>
    </div>
  );
}

/** How the plan's metres map onto the 520 × 420 drawing. */
interface Fit {
  minX: number;
  minZ: number;
  k: number;
  ox: number;
  oz: number;
}
function fitOf(R: PlacedRoom[]): Fit {
  const minX = Math.min(...R.map((r) => r.x));
  const minZ = Math.min(...R.map((r) => r.z));
  const sx = Math.max(...R.map((r) => r.x + r.w)) - minX;
  const sz = Math.max(...R.map((r) => r.z + r.d)) - minZ;
  const k = Math.min(460 / sx, 330 / sz);
  return { minX, minZ, k, ox: (520 - sx * k) / 2, oz: 60 + (340 - sz * k) / 2 };
}

interface Drag {
  id: string;
  pointerId: number;
  /** pointer and room at the start, in drawing units and metres */
  sx: number;
  sy: number;
  x0: number;
  z0: number;
  /** the drawing's scale is held still while dragging */
  fit: Fit;
  x: number;
  z: number;
  moved: boolean;
}

function PlanDrawing({ projectId, rooms, palette, upload }: { projectId: string; rooms: Room[]; palette: string[]; upload?: string }) {
  const openRoom = useOpenRoom();
  useMoveLegacyPlanSpots(projectId, rooms);
  const savePosition = usePlanPositionSaver(projectId, (e) => toast(`Couldn't save where the room sits: ${errorText(e)}`));
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const placed = placeRooms(projectId, rooms);
  const R = drag ? placed.map((p) => (p.room.id === drag.id ? { ...p, x: drag.x, z: drag.z } : p)) : placed;
  const { minX, minZ, k, ox, oz } = drag?.fit ?? fitOf(R);
  const order = new Map(rooms.map((r, i) => [r.id, i]));

  /** A pointer event → drawing units (the canvas may be zoomed). */
  const toDrawing = (e: React.PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: e.clientX, y: e.clientY };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  function down(e: React.PointerEvent, p: PlacedRoom) {
    if (e.button !== 0) return;
    const at = toDrawing(e);
    setDrag({ id: p.room.id, pointerId: e.pointerId, sx: at.x, sy: at.y, x0: p.x, z0: p.z, fit: fitOf(placed), x: p.x, z: p.z, moved: false });
  }
  function move(e: React.PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const at = toDrawing(e);
    const dx = at.x - drag.sx;
    const dy = at.y - drag.sy;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 3) return; // a click or double-click, not a drag
      svg.current?.setPointerCapture(e.pointerId); // only now, so double-click still reaches the room
    }
    setDrag({ ...drag, moved: true, x: snapPlan(drag.x0 + dx / drag.fit.k), z: snapPlan(drag.z0 + dy / drag.fit.k) });
  }
  function up(e: React.PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.moved && (drag.x !== drag.x0 || drag.z !== drag.z0)) {
      const pos: PlanPosition = { x: drag.x, y: drag.z };
      savePosition(drag.id, pos);
    }
    if (!drag.moved) {
      const room = rooms.find((r) => r.id === drag.id);
      if (room) openRoom(room); // a click, not a drag
    }
    setDrag(null);
  }

  return (
    <>
      <svg ref={svg} viewBox="0 0 520 420" width="100%" height="100%" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <rect width="520" height="420" fill="#fff" />
        <text x="20" y="32" fontFamily="JetBrains Mono,monospace" fontSize="12" fill="#7A7A7A">
          {upload ? 'read from your upload' : 'your plan'} · {rooms.length} rooms{drag?.moved ? ` · ${drag.x.toFixed(2)}, ${drag.z.toFixed(2)} m` : ''}
        </text>
        {R.map((p) => {
          const i = order.get(p.room.id) ?? 0;
          const x = ox + (p.x - minX) * k;
          const y = oz + (p.z - minZ) * k;
          const w = p.w * k;
          const h = p.d * k;
          const dragging = drag?.id === p.room.id && drag.moved;
          return (
            <g
              key={p.room.id}
              data-own-pointer
              className={`p2room${p.room.furnish ? ' on' : ''}`}
              style={{ cursor: dragging ? 'grabbing' : 'pointer' }}
              opacity={dragging ? 0.85 : 1}
              onPointerDown={(e) => down(e, p)}
            >
              <title>{p.room.furnish ? `${p.room.name} · ${p.w} × ${p.d} m: click to open, drag to move` : `${p.room.name} · ${p.w} × ${p.d} m (plan only): drag to move`}</title>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={p.room.furnish ? shade(palette[i % palette.length], 0.6) : '#F1EFEC'}
                stroke={dragging ? 'var(--select)' : p.room.furnish ? '#1E1E1E' : '#8A8A8A'}
                strokeWidth={p.room.furnish ? 3 : 1}
              />
              {(() => {
                // furnished rooms: name and size; plan-only rooms: a small name, only where it fits
                const size = p.room.furnish ? (w < 80 ? 10 : 12) : 8.5;
                const label = labelFor(p.room.name, size, w - 6);
                const showDims = p.room.furnish && label && h > 34;
                if (!label || h < size + 4) return null;
                return (
                  <>
                    <text
                      x={x + w / 2}
                      y={y + h / 2 - (showDims ? 5 : 0)}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontFamily="Inter,sans-serif"
                      fontWeight={p.room.furnish ? 600 : 500}
                      fontSize={size}
                      fill={p.room.furnish ? '#1E1E1E' : '#8A8A8A'}
                      pointerEvents="none"
                    >
                      {label}
                    </text>
                    {showDims && (
                      <text x={x + w / 2} y={y + h / 2 + 10} textAnchor="middle" dominantBaseline="central" fontFamily="JetBrains Mono,monospace" fontSize="9.5" fill="#7A7A7A" pointerEvents="none">
                        {p.w} × {p.d} m
                      </text>
                    )}
                  </>
                );
              })()}
            </g>
          );
        })}
      </svg>
      {upload && (
        <div className="upthumb">
          <img src={upload} alt="Your uploaded floor plan" />
        </div>
      )}
    </>
  );
}

/** Whether a label fits a box this wide, roughly (Inter at this size averages ~0.56 em per character). */
const fits = (text: string, size: number, width: number) => text.length * size * 0.56 <= width;
/** The longest of the room's names that fits, or null. */
const labelFor = (name: string, size: number, width: number) =>
  fits(name, size, width) ? name : fits(shortName(name), size, width) ? shortName(name) : null;

/** Clicking a room on the plan: its page, or why it has none. */
function useOpenRoom() {
  const goPage = useEditorStore((s) => s.goPage);
  return (room: Room) =>
    room.furnish ? goPage(room.id) : toast(`${room.name} is on the plan only (furnishing turned off)`);
}

const SHOT_W = 1040;
const SHOT_H = 840;

/**
 * The "3D floor plan": every room at its plan position as an isometric clay model. The picture is rendered once
 * per view; rooms are hit areas over it (hover to highlight, click to open the page) with HTML labels, and the
 * view turns in quarter turns.
 */
export function Plan3DFrame({ projectId, rooms, palette }: { projectId: string; rooms: Room[]; palette: string[] }) {
  useMoveLegacyPlanSpots(projectId, rooms);
  const openRoom = useOpenRoom();
  const [turn, setTurn] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const R = placeRooms(projectId, rooms);
  const shotRooms = R.map((p) => ({ name: p.room.name, x: p.x, z: p.z, w: p.w, d: p.d, kind: shotKind(p.room), open: openOf(p.room.floorPlan) }));
  const key = JSON.stringify([shotRooms, palette, turn]);
  const { src, map } = useMemo(() => {
    if (!R.length) return { src: '', map: [] };
    try {
      return { src: planShot(shotRooms, palette, SHOT_W, SHOT_H, turn, false).toDataURL('image/jpeg', 0.9), map: planShotMap(shotRooms, SHOT_W, SHOT_H, turn) };
    } catch {
      return { src: '', map: [] }; // no WebGL
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!src) return <p className="muted" style={{ padding: 16 }}>{R.length ? '3D needs WebGL.' : 'Add rooms to see them in 3D.'}</p>;

  // labels: furnished rooms always, other rooms when their floor is big enough on screen to carry one
  const LABEL = 22;
  return (
    <div className="plan3d">
      <img className="shot" alt="3D model of the whole floor plan" src={src} draggable={false} />
      <svg className="plan3d-map" viewBox={`0 0 ${SHOT_W} ${SHOT_H}`} preserveAspectRatio="xMidYMid slice">
        {R.map((p, i) => {
          const m = map[i];
          if (!m) return null;
          const xs = m.floor.map(([x]) => x);
          const span = Math.max(...xs) - Math.min(...xs);
          const text = hover === p.room.id || p.room.furnish ? labelFor(p.room.name, LABEL, span * 0.9) ?? shortName(p.room.name) : labelFor(p.room.name, LABEL * 0.85, span * 0.55);
          const tw = text ? text.length * (p.room.furnish ? LABEL : LABEL * 0.85) * 0.56 + 26 : 0;
          return (
            <g
              key={p.room.id}
              data-own-pointer
              className={`p3room${p.room.furnish ? ' on' : ''}${hover === p.room.id ? ' hot' : ''}`}
              onMouseEnter={() => setHover(p.room.id)}
              onMouseLeave={() => setHover((h) => (h === p.room.id ? null : h))}
              onClick={() => openRoom(p.room)}
            >
              <title>{p.room.furnish ? `${p.room.name}: click to open` : `${p.room.name} (plan only)`}</title>
              <polygon points={m.floor.map((q) => q.join(',')).join(' ')} />
              {text && (
                <g transform={`translate(${m.centre[0]} ${m.centre[1]})`} className="p3label">
                  <rect x={-tw / 2} y={-19} width={tw} height={38} rx={19} />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={p.room.furnish ? LABEL : LABEL * 0.85}>
                    {text}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="plan3d-turn" data-own-pointer>
        <button type="button" className="pbtn sm" aria-label="Turn the view left" onClick={() => setTurn((t) => (t + 3) % 4)}>
          ⟲
        </button>
        <button type="button" className="pbtn sm" aria-label="Turn the view right" onClick={() => setTurn((t) => (t + 1) % 4)}>
          ⟳
        </button>
      </div>
    </div>
  );
}

/**
 * Furnish every room that has a budget and no layout yet: find products (in the room's moodboard style, or the
 * home's), then lay it out. Two rooms at a time; the shop search is rate-limited on the API anyway.
 */
function useFurnishAll() {
  const qc = useQueryClient();
  const [state, setState] = useState<{ done: number; total: number; current: string[]; failed: string[] } | null>(null);
  const run = async (todo: Room[]) => {
    const failed: string[] = [];
    let done = 0;
    const current = new Set<string>();
    setState({ done, total: todo.length, current: [], failed });
    const queue = [...todo];
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        current.add(r.name);
        setState({ done, total: todo.length, current: [...current], failed: [...failed] });
        try {
          await api(`/rooms/${r.id}/listings/search`, { method: 'POST', body: {} });
          await api(`/rooms/${r.id}/layouts`, { method: 'POST' });
        } catch (e) {
          failed.push(`${r.name}: ${errorText(e)}`);
        }
        qc.invalidateQueries({ queryKey: qk.listings(r.id) });
        qc.invalidateQueries({ queryKey: qk.layouts(r.id) });
        current.delete(r.name);
        done++;
        setState({ done, total: todo.length, current: [...current], failed: [...failed] });
      }
    };
    await Promise.all([worker(), worker()]);
    toast(failed.length ? `${todo.length - failed.length} of ${todo.length} rooms furnished; ${failed[0]}` : `${todo.length} rooms furnished`);
  };
  return { state, running: !!state && state.done < state.total, run };
}

/** "N rooms found": one row per room → its page, with its budget; "Furnish every room"; "+ Add rooms". */
export function FoundFrame({ projectId, rooms, palette }: { projectId: string; rooms: Room[]; palette: string[] }) {
  const goPage = useEditorStore((s) => s.goPage);
  const setAdding = useEditorStore((s) => s.setAddingRooms);
  const ids = useMemo(() => rooms.map((r) => r.id), [rooms]);
  const spent = useProjectSpend(ids);
  const furnish = useFurnishAll();
  const active = rooms.filter((r) => r.furnish);
  const noBudget = active.filter((r) => r.budgetCad == null);
  const ready = active.filter((r) => r.budgetCad != null && spent[r.id] == null);
  return (
    <div className="found" data-own-wheel>
      <div className="found-h">
        <h4>{rooms.length} rooms found</h4>
        <button
          className="pbtn sm"
          type="button"
          onClick={() => {
            setAdding(projectId);
            goPage('plan', 'plan');
          }}
        >
          + Add rooms
        </button>
      </div>
      <p className="found-note">
        Set each room’s budget, then furnish them. {noBudget.length ? `${noBudget.length} still need a budget.` : 'Every room has a budget.'}
      </p>
      {rooms.map((r, i) =>
        r.furnish ? (
          <div key={r.id} className="frow-b">
            <button className="frow" type="button" onClick={() => goPage(r.id)}>
              <span className="sw" style={{ background: palette[i % palette.length] }} />
              <span>{r.name}</span>
              <small>
                {r.areaM2.toFixed(1)} m²{spent[r.id] != null ? ' · furnished' : ''}
              </small>
              <span className="muted">→</span>
            </button>
            <RoomBudget room={r} projectId={projectId} spent={spent[r.id] ?? null} compact />
          </div>
        ) : (
          <div key={r.id} className="frow planonly" title="On the plan only: furnishing turned off">
            <span className="sw" />
            <span>{r.name}</span>
            <small>{r.areaM2.toFixed(1)} m² · plan only</small>
            <span />
          </div>
        ),
      )}
      <button
        className="pbtn dark pvbtn"
        type="button"
        disabled={furnish.running || !ready.length}
        title={ready.length ? undefined : noBudget.length ? 'Set the rooms’ budgets first' : 'Every room with a budget is furnished'}
        onClick={() => furnish.run(ready)}
      >
        {furnish.running
          ? `Furnishing ${furnish.state!.done + 1} of ${furnish.state!.total}: ${furnish.state!.current.join(', ')}…`
          : ready.length
            ? `Furnish ${ready.length} room${ready.length === 1 ? '' : 's'}`
            : 'Furnish every room'}
      </button>
      {furnish.state?.failed.map((f) => (
        <p key={f} className="found-note err">
          {f}
        </p>
      ))}
    </div>
  );
}
