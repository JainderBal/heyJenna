import { FloorPlan, Size, Wall } from '@hey-jenna/contracts';
import { LayoutData, MOVABLE_LAYERS, PlacedObject } from '../layout.types';
import { corners, Footprint, insideRoom, overlaps } from './geometry';

/** Pieces that stand on the floor and can be added by hand, with the layer the engine files them under. */
export const FLOOR_LAYER: Record<string, string> = {
  sofa: 'furniture', armchair: 'furniture', coffee_table: 'furniture', side_table: 'furniture', shelf: 'furniture',
  desk: 'furniture', desk_chair: 'furniture', sideboard: 'furniture', cat_tree: 'furniture', pouf: 'furniture',
  floor_lamp: 'lighting', plant: 'plants', rug: 'soft_furnishings',
};
export const isFloorType = (t: string) => t in FLOOR_LAYER;

/** Same numbers as the engine (engines/layout/design_logic.py R). */
const DOOR_DEPTH = 0.9; // keep this much clear in front of a door
const WINDOW_BAND = 0.45; // tall things stay this far from a window
const USE_DEPTH = 0.45; // room to sit down / open a door in front of a seat or storage
const ROT: Record<Wall, number> = { back: 0, left: 90, right: 270, front: 180 };
const SEATS = ['sofa', 'armchair'];
const FRONT_USE = ['sofa', 'armchair', 'shelf', 'sideboard', 'desk'];
const AGAINST_WALL = ['shelf', 'sideboard', 'desk', 'cat_tree', 'sofa'];

export interface FloorPiece { type: string; size: Size }
export interface FloorPose { x: number; y: number; rotationDeg: number }
export interface FloorSpot extends FloorPose { near?: string }

export const footprintOf = (o: PlacedObject): Footprint => ({ x: o.position.x, y: o.position.y, w: o.size.w, d: o.size.d, rotationDeg: o.rotation_deg });
const fp = (p: FloorPiece, at: FloorPose): Footprint => ({ x: at.x, y: at.y, w: p.size.w, d: p.size.d, rotationDeg: at.rotationDeg });

/** A box of width w (along the wall) and depth d (into the room) with its back on `wall`. */
function against(plan: FloorPlan, wall: Wall, u: number, w: number, d: number): Footprint {
  const p = { back: { x: u, y: d / 2 }, front: { x: u, y: plan.depth - d / 2 }, left: { x: d / 2, y: u }, right: { x: plan.width - d / 2, y: u } }[wall];
  return { ...p, w, d, rotationDeg: ROT[wall] };
}

/** In front of each door: its width + 20 cm, 90 cm deep (or the leaf, if wider and swinging in), as the engine checks. */
const doorZones = (plan: FloorPlan) =>
  plan.doors.map((d) => ({ id: d.id, zone: against(plan, d.wall, d.position, d.width + 0.2, Math.max(DOOR_DEPTH, d.swing === 'in' ? d.width : 0)) }));

/** A 45 cm band in front of each window (its width + 30 cm) that tall pieces keep out of. */
const windowZones = (plan: FloorPlan) =>
  plan.windows.map((w) => ({ id: w.id, sill: w.sill, zone: against(plan, w.wall, w.position, w.width + 0.3, WINDOW_BAND) }));

/** Floor pieces that get in each other's way (rugs lie under things; walls, zones and wall art don't count). */
const blocking = (o: PlacedObject) => o.mount === 'floor' && MOVABLE_LAYERS.includes(o.layer) && o.type !== 'rug';
/** Built-ins standing on the floor (window seats, shelves, platforms…), not paint or panelling. */
const builtIn = (o: PlacedObject) => o.layer === 'features' && o.mount === 'floor' && !['feature_wall', 'wainscoting', 'ceiling_beam', 'platform'].includes(o.type);

/** Hard problems with standing `piece` at `at`. Empty = allowed. */
export function floorClashes(plan: FloorPlan, data: LayoutData, piece: FloorPiece, at: FloorPose): string[] {
  const f = fp(piece, at);
  const problems: string[] = [];
  if (!insideRoom(f, plan.width, plan.depth)) problems.push('sticks out of the room');
  if (piece.type === 'rug') return problems; // flat: may lie in front of doors and windows
  for (const d of doorZones(plan)) if (overlaps(f, d.zone)) problems.push(`blocks door ${d.id} (keep ${DOOR_DEPTH * 100} cm clear in front)`);
  for (const w of windowZones(plan))
    if (piece.size.h > w.sill - 0.02 && overlaps(f, w.zone)) problems.push(`too tall to stand in front of window ${w.id} (${piece.size.h} m, sill at ${w.sill} m)`);
  for (const o of data.objects) if (builtIn(o) && overlaps(f, footprintOf(o))) problems.push(`overlaps ${o.id}`);
  return problems;
}

/** The strip in front of a seat or storage piece you need to use it. */
function frontStrip(o: PlacedObject): Footprint {
  const r = (o.rotation_deg * Math.PI) / 180;
  const off = o.size.d / 2 + USE_DEPTH / 2;
  return { x: o.position.x + Math.sin(r) * off, y: o.position.y + Math.cos(r) * off, w: o.size.w, d: USE_DEPTH, rotationDeg: o.rotation_deg };
}

/** Soft issues: allowed, but worth telling the person. */
export function floorWarnings(data: LayoutData, piece: FloorPiece, at: FloorPose, id = 'it'): string[] {
  if (piece.type === 'rug') return [];
  const f = fp(piece, at);
  const out: string[] = [];
  for (const o of data.objects.filter(blocking)) if (overlaps(f, footprintOf(o))) out.push(`${id} overlaps ${o.id}`);
  if (!['pouf', 'coffee_table', 'desk_chair'].includes(piece.type))
    for (const o of data.objects.filter((o) => blocking(o) && FRONT_USE.includes(o.type)))
      if (overlaps(f, frontStrip(o)) && !overlaps(f, footprintOf(o))) out.push(`${id} stands in front of ${o.id}, in the way of using it`);
  return out;
}

// ---------------------------------------------------------------- finding a spot

/** Where p is in o's frame: `side` across its width, `fwd` out of its front (rotation 0 faces +y). */
function local(p: { x: number; y: number }, o: PlacedObject) {
  const r = (o.rotation_deg * Math.PI) / 180, dx = p.x - o.position.x, dy = p.y - o.position.y;
  return { side: dx * Math.cos(r) - dy * Math.sin(r), fwd: dx * Math.sin(r) + dy * Math.cos(r) };
}

/** Clear gap between two footprints' bounding boxes (0 when touching or overlapping). */
function gap(a: Footprint, b: Footprint) {
  const box = (f: Footprint) => { const c = corners(f); return { x0: Math.min(...c.map((p) => p[0])), x1: Math.max(...c.map((p) => p[0])), y0: Math.min(...c.map((p) => p[1])), y1: Math.max(...c.map((p) => p[1])) }; };
  const A = box(a), B = box(b);
  return Math.hypot(Math.max(0, A.x0 - B.x1, B.x0 - A.x1), Math.max(0, A.y0 - B.y1, B.y0 - A.y1));
}

const nearestWall = (plan: FloorPlan, x: number, y: number): Wall =>
  ([['back', y], ['front', plan.depth - y], ['left', x], ['right', plan.width - x]] as [Wall, number][]).sort((a, b) => a[1] - b[1])[0][0];

/** A piece put down by hand without a direction turns its back to the nearest wall. */
export const defaultRotation = (plan: FloorPlan, x: number, y: number) => ROT[nearestWall(plan, x, y)];

/** Turn to face (tx, ty), snapped to a quarter turn. */
const facing = (x: number, y: number, tx: number, ty: number) => ((Math.round((Math.atan2(tx - x, ty - y) * 180) / Math.PI / 90) * 90) % 360 + 360) % 360;

interface Candidate extends FloorPose { wall?: Wall }

/** Every pose worth trying: backs to each wall every 5 cm, and a 10 cm grid over the floor with the back to the nearest wall. */
function candidates(plan: FloorPlan, piece: FloorPiece): Candidate[] {
  const out: Candidate[] = [];
  for (const wall of ['back', 'left', 'right', 'front'] as Wall[]) {
    const L = wall === 'back' || wall === 'front' ? plan.width : plan.depth;
    for (let u = piece.size.w / 2; u <= L - piece.size.w / 2 + 1e-9; u += 0.05) {
      const f = against(plan, wall, u, piece.size.w, piece.size.d + 0.02);
      out.push({ x: f.x, y: f.y, rotationDeg: ROT[wall], wall });
    }
  }
  for (let x = 0.1; x < plan.width; x += 0.1)
    for (let y = 0.1; y < plan.depth; y += 0.1) out.push({ x, y, rotationDeg: ROT[nearestWall(plan, x, y)] });
  return out;
}

/**
 * How well a free pose suits the piece (lower = better), and what it's next to.
 * Side tables and floor lamps go beside a seat, poufs and armchairs join the coffee table,
 * plants go into corners, storage backs onto a wall, rugs lie under the seating.
 */
function score(plan: FloorPlan, data: LayoutData, piece: FloorPiece, c: Candidate): { cost: number; near?: string; rotationDeg?: number } {
  const floor = data.objects.filter(blocking);
  const seats = floor.filter((o) => SEATS.includes(o.type));
  const table = floor.find((o) => o.type === 'coffee_table');
  const f = fp(piece, c);
  const reach = Math.max(piece.size.w, piece.size.d) / 2;
  const besideSeat = (back: number) => {
    let best = { cost: 5 + (c.wall ? 0 : 0.5), near: undefined as string | undefined };
    for (const s of seats) {
      const l = local(c, s);
      const cost = Math.abs(Math.abs(l.side) - (s.size.w / 2 + reach + 0.05)) + Math.abs(l.fwd + back * s.size.d);
      if (cost < best.cost) best = { cost, near: s.id };
    }
    return best;
  };
  switch (piece.type) {
    case 'side_table': return besideSeat(0.1);
    case 'floor_lamp': return besideSeat(0.3);
    case 'plant': {
      const toCorner = Math.min(...[[0, 0], [plan.width, 0], [0, plan.depth], [plan.width, plan.depth]].map(([x, y]) => Math.hypot(c.x - x, c.y - y)));
      const besideFurniture = Math.min(1, ...floor.map((o) => gap(f, footprintOf(o))));
      return { cost: toCorner + 0.3 * besideFurniture };
    }
    case 'pouf':
    case 'armchair': {
      const partner = table ?? seats.find((o) => o.type === 'sofa');
      if (!partner) return { cost: 3 + (c.wall ? 0 : 1) };
      const want = piece.type === 'pouf' ? 0.35 : 0.5;
      // an armchair turns to face the coffee table; a pouf doesn't care
      const rot = piece.type === 'armchair' ? facing(c.x, c.y, partner.position.x, partner.position.y) : c.rotationDeg;
      return { cost: Math.abs(gap({ ...f, rotationDeg: rot }, footprintOf(partner)) - want), near: partner.id, rotationDeg: rot };
    }
    case 'rug': {
      const anchor = table ?? seats[0];
      const [tx, ty] = anchor ? [anchor.position.x, anchor.position.y] : [plan.width / 2, plan.depth / 2];
      return { cost: Math.hypot(c.x - tx, c.y - ty), near: anchor?.id };
    }
    default: {
      // storage and the rest: back to a wall if it's that kind of piece, then the most open floor
      const open = Math.min(2, ...floor.map((o) => gap(f, footprintOf(o))));
      const doors = Math.min(3, ...doorZones(plan).map((d) => gap(f, d.zone)));
      return { cost: (AGAINST_WALL.includes(piece.type) && !c.wall ? 10 : 0) - open - 0.3 * doors };
    }
  }
}

/** Best free floor spot for a piece, or null if there is none. */
export function findFloorSpot(plan: FloorPlan, data: LayoutData, piece: FloorPiece): FloorSpot | null {
  const others = data.objects.filter(blocking);
  let best: (FloorSpot & { cost: number }) | null = null;
  for (const c of candidates(plan, piece)) {
    const s = score(plan, data, piece, c);
    if (best && s.cost >= best.cost) continue;
    const pose = { x: c.x, y: c.y, rotationDeg: s.rotationDeg ?? c.rotationDeg };
    if (floorClashes(plan, data, piece, pose).length) continue;
    if (piece.type !== 'rug') {
      const f = fp(piece, pose);
      if (others.some((o) => overlaps(f, footprintOf(o), -0.03))) continue; // keep 3 cm between pieces
      if (floorWarnings(data, piece, pose).length) continue;
    }
    best = { ...pose, near: s.near, cost: s.cost };
  }
  if (!best) return null;
  const mm = (v: number) => Math.round(v * 1000) / 1000;
  return { x: mm(best.x), y: mm(best.y), rotationDeg: best.rotationDeg, ...(best.near ? { near: best.near } : {}) };
}
