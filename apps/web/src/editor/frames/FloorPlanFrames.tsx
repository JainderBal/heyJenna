/**
 * Floor plan page frames (the prototype's Plan, 3D floor plan, Rooms found):
 *  - plan: the rooms drawn to scale; drag a room to move it (saved to the API as its planPosition,
 *    debounced after the drop). With no rooms yet, or after "+ Add rooms", it holds the intake:
 *    read a plan photo (POST /projects/:id/floor-plan) → preview → "Create these rooms"; on 422 (no
 *    ANTHROPIC_API_KEY on the API, or no rooms found) → "Draw rooms" by hand, or the sample plan.
 *  - plan3d: the whole plan as an isometric clay model (the prototype's planShot).
 *  - found: one row per room → its page, and "+ Add rooms".
 * Plan-only rooms (closets, laundry, balcony: furnish = false) are drawn on the plan but get no page.
 */
import { useMemo, useRef, useState } from 'react';
import type { BulkRoomInput, FloorPlan, PlanPosition } from '@hey-jenna/contracts';
import { useBulkCreateRooms, usePlanPositionSaver, useReadFloorPlan } from '../../api/hooks';
import { errorText, isApiError } from '../../api/client';
import { canFurnish, type DetectedRoom, type Room } from '../../api/types';
import { toast, useEditorStore } from '../../app/useEditorStore';
import { PlanDrop } from '../icons';
import { PLANS, floorPlanOf, placeRooms, sampleRooms, snapPlan, type PlacedRoom } from '../plans';
import { useMoveLegacyPlanSpots } from '../useLegacyPlanSpots';
import { shade } from '../colour';
import { planShot, shotKind } from '../../viewer/three-kit';

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
      <div className="addf">
        <h3>{mode.rooms.length} rooms found</h3>
        <p>Untick a room to keep it on the plan without furnishing it. jenna furnishes living rooms and offices for now.</p>
        <ul>
          {mode.rooms.map((r, i) => (
            <li key={i} className={r.furnish ? undefined : 'planonly'}>
              <label>
                <input
                  type="checkbox"
                  checked={r.furnish}
                  disabled={busy || !canFurnish(r.kind)}
                  title={canFurnish(r.kind) ? undefined : `jenna can't furnish ${r.kind} rooms yet`}
                  onChange={(e) =>
                    setMode({ ...mode, rooms: mode.rooms.map((x, j) => (j === i ? { ...x, furnish: e.target.checked } : x)) })
                  }
                />
                <span>{r.name}</span>
              </label>
              <small>
                {r.kind}
                {canFurnish(r.kind) ? '' : ' (not yet)'} · {r.floorPlan.width} × {r.floorPlan.depth} m{openOf(r.floorPlan).length ? ' · open-plan' : ''}
                {r.confidence < 0.6 ? ' · unsure' : ''}
              </small>
            </li>
          ))}
        </ul>
        {mode.warnings.map((w, i) => (
          <p key={i} className="warn">
            {w}
          </p>
        ))}
        <div className="acts">
          <button
            className="pbtn dark"
            type="button"
            disabled={busy}
            onClick={() =>
              create(
                mode.rooms.map((r) => ({
                  name: r.name, floorPlan: r.floorPlan, needs: [], planPosition: { x: r.position.x, y: r.position.y }, kind: r.kind, furnish: r.furnish,
                })),
              )
            }
          >
            {bulk.isPending ? 'Creating…' : 'Create these rooms'}
          </button>
          <button className="pbtn" type="button" disabled={busy} onClick={() => setMode({ kind: 'idle' })}>
            Cancel
          </button>
        </div>
      </div>
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
  if (!rooms.length) return <RoomsIntake projectId={projectId} empty />;
  if (adding) return <RoomsIntake projectId={projectId} empty={false} onClose={() => setAdding(null)} />;
  return <PlanDrawing projectId={projectId} rooms={rooms} palette={palette} upload={upload} />;
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
  const goPage = useEditorStore((s) => s.goPage);
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
              style={{ cursor: dragging ? 'grabbing' : 'grab' }}
              opacity={dragging ? 0.85 : 1}
              onPointerDown={(e) => down(e, p)}
              onDoubleClick={() => p.room.furnish && goPage(p.room.id)}
            >
              <title>{p.room.furnish ? `${p.room.name}: drag to move, double-click to open` : `${p.room.name} (plan only): drag to move`}</title>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={p.room.furnish ? shade(palette[i % palette.length], 0.6) : '#F1EFEC'}
                stroke={dragging ? 'var(--select)' : '#1E1E1E'}
                strokeWidth={p.room.furnish ? 3.5 : 1.5}
              />
              <text x={x + w / 2} y={y + h / 2 - 2} textAnchor="middle" fontFamily="Inter,sans-serif" fontWeight="600" fontSize={w < 80 ? 10 : 13} fill="#1E1E1E" pointerEvents="none">
                {p.room.name}
              </text>
              <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fontFamily="JetBrains Mono,monospace" fontSize="10" fill="#7A7A7A" pointerEvents="none">
                {p.w}×{p.d}
              </text>
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

/** The prototype's "3D floor plan": every room at its plan position, as an isometric clay model with labels. */
export function Plan3DFrame({ projectId, rooms, palette }: { projectId: string; rooms: Room[]; palette: string[] }) {
  useMoveLegacyPlanSpots(projectId, rooms);
  const R = placeRooms(projectId, rooms);
  const key = JSON.stringify([R.map((p) => [p.room.name, p.x, p.z, p.w, p.d, shotKind(p.room), openOf(p.room.floorPlan)]), palette]);
  const src = useMemo(() => {
    if (!R.length) return '';
    try {
      // 2× the frame for a crisp image, as the prototype's 1040 × 840
      return planShot(R.map((p) => ({ name: p.room.name, x: p.x, z: p.z, w: p.w, d: p.d, kind: shotKind(p.room), open: openOf(p.room.floorPlan) })), palette, 1040, 840).toDataURL('image/jpeg', 0.9);
    } catch {
      return ''; // no WebGL
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!src) return <p className="muted" style={{ padding: 16 }}>{R.length ? '3D needs WebGL.' : 'Add rooms to see them in 3D.'}</p>;
  return <img className="shot" alt="3D render of the whole floor plan" src={src} />;
}

/** "N rooms found": one row per room → its page; "+ Add rooms" opens the intake in the Plan frame. */
export function FoundFrame({ projectId, rooms, palette }: { projectId: string; rooms: Room[]; palette: string[] }) {
  const goPage = useEditorStore((s) => s.goPage);
  const setAdding = useEditorStore((s) => s.setAddingRooms);
  return (
    <div className="found">
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
      {rooms.map((r, i) =>
        r.furnish ? (
          <button key={r.id} className="frow" type="button" onClick={() => goPage(r.id)}>
            <span className="sw" style={{ background: palette[i % palette.length] }} />
            <span>{r.name}</span>
            <small>{r.areaM2.toFixed(1)} m²</small>
            <span className="muted">→</span>
          </button>
        ) : (
          <div key={r.id} className="frow planonly" title="On the plan only: not furnished">
            <span className="sw" />
            <span>{r.name}</span>
            <small>{r.areaM2.toFixed(1)} m² · plan only</small>
            <span />
          </div>
        ),
      )}
    </div>
  );
}
