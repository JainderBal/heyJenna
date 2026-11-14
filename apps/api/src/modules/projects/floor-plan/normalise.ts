import { BulkRoomInput, FloorPlan, MIN_ROOM_SIDE, RoomKind, Wall, furnishedByDefault } from '@hey-jenna/contracts';
import { PlanReading } from './floor-plan.reader';

/** Where the room sits on the uploaded image, as fractions of its width and height (0..1). */
export interface ImageBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DetectedRoom {
  name: string;
  kind: RoomKind;
  /** false for closets, laundry, halls, balconies: kept on the plan, no furniture. */
  furnish: boolean;
  confidence: number;
  /** The size label as printed on the plan, when there is one. */
  printedSize: string | null;
  position: { x: number; y: number };
  box: ImageBox | null;
  floorPlan: FloorPlan;
}
export interface FloorPlanPreview {
  rooms: DetectedRoom[];
  scaleSource: PlanReading['scaleSource'];
  warnings: string[];
}

const MAX = 30;
/** Printed and read sizes further apart than this get a warning (the printed one wins). */
const SIZE_TOLERANCE = 0.08;
/** Narrower than this is not a real door or window. */
const MIN_OPENING = 0.3;
/** Wider than this is a sliding / patio door or an archway: nothing swings into the room. */
const MAX_SWING_DOOR = 1.1;
/** Openings moved further than this onto their wall are worth a warning (smaller moves are rounding). */
const NUDGE_WARNING = 0.05;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (s: string) => Number(s.replace(',', '.'));

/**
 * One printed length → metres. Handles 10'11", 12', 10' 11 ½", 3.2 m, 3,2 m, 320 cm, 3200 mm.
 * Bare numbers are read as metres (< 30), centimetres (< 3000) or millimetres.
 */
export function parseLength(raw: string): number | null {
  const s = raw.trim().replace(/[’′‘`]/g, "'").replace(/[”″“]|''/g, '"').replace(/½/g, '.5').replace(/\s+(?=\.5)/g, '');
  const imperial = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:'|ft\.?|pi(?:eds?)?)\s*(?:-?\s*(\d+(?:[.,]\d+)?)\s*(?:"|in\.?|po(?:uces?)?)?)?$/i);
  if (imperial) return (num(imperial[1]) * 12 + (imperial[2] ? num(imperial[2]) : 0)) * 0.0254;
  const inches = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:"|in\.?)$/i);
  if (inches) return num(inches[1]) * 0.0254;
  const metric = s.match(/^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?$/i);
  if (!metric) return null;
  const v = num(metric[1]);
  const unit = metric[2]?.toLowerCase() ?? (v < MAX ? 'm' : v < 3000 ? 'cm' : 'mm');
  return unit === 'mm' ? v / 1000 : unit === 'cm' ? v / 100 : v;
}

/** "10'11" x 13'4"" → both sides in metres (order as printed), or null when it can't be read. */
export function parsePrintedSize(raw: string | null | undefined): [number, number] | null {
  if (!raw) return null;
  const parts = raw.split(/\s*(?:x|×|\*|by|par)\s*/i);
  if (parts.length !== 2) return null;
  // "3.2 x 4.1 m": the unit after the second number applies to both
  const unit = parts[1].match(/(mm|cm|m)\s*$/i)?.[1];
  const a = parseLength(unit && /\d$/.test(parts[0].trim()) ? `${parts[0]} ${unit}` : parts[0]);
  const b = parseLength(parts[1]);
  return a && b && a > 0 && b > 0 ? [a, b] : null;
}

/** Printed sides don't say which is the width: take the order that best matches what was read off the drawing. */
function orient([a, b]: [number, number], width: number, depth: number): [number, number] {
  return Math.abs(a - width) + Math.abs(b - depth) <= Math.abs(b - width) + Math.abs(a - depth) ? [a, b] : [b, a];
}

function cleanBox(box: PlanReading['rooms'][number]['box'] | undefined): ImageBox | null {
  if (!box) return null;
  const left = clamp(Math.min(box.left, box.right), 0, 1);
  const right = clamp(Math.max(box.left, box.right), 0, 1);
  const top = clamp(Math.min(box.top, box.bottom), 0, 1);
  const bottom = clamp(Math.max(box.top, box.bottom), 0, 1);
  if (right - left < 0.005 || bottom - top < 0.005) return null;
  const f = (v: number) => Math.round(v * 10000) / 10000;
  return { left: f(left), top: f(top), right: f(right), bottom: f(bottom) };
}

type RawOpening = { wall: Wall; position: number; width: number };

/**
 * Openings read a little off (past a corner, wider than the wall) slide back onto their wall instead of being lost.
 * Openings on open walls go (there is no wall), and overlapping ones keep the first (doors before windows).
 */
function fitOpenings(raw: { doors: RawOpening[]; windows: RawOpening[] }, width: number, depth: number, open: Set<Wall>) {
  const along = (wall: Wall) => (wall === 'back' || wall === 'front' ? width : depth);
  let moved = 0;
  let dropped = 0;
  const placed: { wall: Wall; a: number; b: number }[] = [];
  const fit = (o: RawOpening): RawOpening | null => {
    if (open.has(o.wall)) return null;
    if (!(o.width > 0) || !Number.isFinite(o.position)) return (dropped++, null);
    // whole centimetres with an even width, so the centre and both edges stay on the wall after rounding
    const Lcm = Math.round(along(o.wall) * 100);
    const wcm = 2 * Math.floor(Math.min(Math.round(o.width * 100), Lcm) / 2);
    const pcm = clamp(Math.round(o.position * 100), wcm / 2, Lcm - wcm / 2);
    const w = wcm / 100;
    const position = pcm / 100;
    if (w < MIN_OPENING) return (dropped++, null);
    if (placed.some((p) => p.wall === o.wall && position - w / 2 < p.b - 0.01 && position + w / 2 > p.a + 0.01)) return (dropped++, null);
    if (Math.abs(position - o.position) > NUDGE_WARNING || Math.abs(w - o.width) > NUDGE_WARNING) moved++;
    placed.push({ wall: o.wall, a: position - w / 2, b: position + w / 2 });
    return { wall: o.wall, position, width: w };
  };
  const doors = raw.doors.map(fit).filter((o): o is RawOpening => !!o);
  const windows = raw.windows.map(fit).filter((o): o is RawOpening => !!o);
  return { doors, windows, moved, dropped };
}

/** Claude's reading → valid floorPlan objects: printed sizes parsed here, openings fitted, open walls marked, with warnings. */
export function normalisePlan(reading: PlanReading): FloorPlanPreview {
  const warnings = [...reading.notes];
  if (reading.scaleSource === 'door') warnings.push('No printed dimensions: sizes scaled from a door taken as 0.9 m wide');
  if (reading.scaleSource === 'guess') warnings.push('No dimensions or doors to scale from: sizes are rough guesses');

  const rooms: DetectedRoom[] = [];
  const seen = new Map<string, number>();
  reading.rooms.forEach((raw, i) => {
    const label = raw.name.trim().slice(0, 110) || `Room ${i + 1}`;
    // two walk-ins, two bathrooms…: number the repeats so every room has its own name
    const n = (seen.get(label.toLowerCase()) ?? 0) + 1;
    seen.set(label.toLowerCase(), n);
    const name = n > 1 ? `${label} ${n}` : label;
    let width = raw.width;
    let depth = raw.depth;

    const printed = parsePrintedSize(raw.printedSize);
    if (printed) {
      const [pw, pd] = orient(printed, width, depth);
      if (width > 0 && depth > 0 && (Math.abs(pw - width) / pw > SIZE_TOLERANCE || Math.abs(pd - depth) / pd > SIZE_TOLERANCE))
        warnings.push(`${name}: read as ${r2(width)} × ${r2(depth)} m but printed ${raw.printedSize}; using the printed size`);
      width = pw;
      depth = pd;
    }
    if (!(width > 0) || !(depth > 0)) {
      warnings.push(`${name}: no usable size, skipped`);
      return;
    }
    const w = r2(clamp(width, MIN_ROOM_SIDE, MAX));
    const d = r2(clamp(depth, MIN_ROOM_SIDE, MAX));
    if (w !== r2(width) || d !== r2(depth)) warnings.push(`${name}: size clamped to ${w} × ${d} m`);

    const open = new Set<Wall>(raw.openWalls ?? []);
    const { doors, windows, moved, dropped } = fitOpenings(raw, w, d, open);
    if (moved) warnings.push(`${name}: ${moved} opening(s) nudged to fit the walls`);
    if (dropped) warnings.push(`${name}: ${dropped} opening(s) overlapped or were too small and were dropped`);

    const kind = RoomKind.catch('other').parse(raw.kind);
    rooms.push({
      name,
      kind,
      furnish: furnishedByDefault(kind),
      confidence: r2(clamp(raw.confidence, 0, 1)),
      printedSize: raw.printedSize?.trim().slice(0, 60) || null,
      position: { x: r2(Math.max(0, raw.x)), y: r2(Math.max(0, raw.y)) },
      box: cleanBox(raw.box),
      floorPlan: FloorPlan.parse({
        width: w,
        depth: d,
        walls: Object.fromEntries([...open].map((wall) => [wall, { finish: 'paint', open: true }])),
        windows: windows.map((o, j) => ({ id: `w${j + 1}`, ...o })),
        doors: doors.map((o, j) => ({ id: `d${j + 1}`, ...o, swing: o.width > MAX_SWING_DOOR ? 'none' : 'in' })),
      }),
    });
  });
  return { rooms: rooms.slice(0, 30), scaleSource: reading.scaleSource, warnings };
}

export const toBulkRooms = (rooms: DetectedRoom[]): BulkRoomInput[] =>
  rooms.map((r) => ({ name: r.name, floorPlan: r.floorPlan, needs: [], planPosition: r.position, kind: r.kind, furnish: r.furnish }));
