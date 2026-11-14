import { FloorPlan, Size, Wall } from '@hey-jenna/contracts';
import { LayoutData, PlacedObject } from '../layout.types';

export const WALL_TYPES = ['art', 'mirror', 'wall_shelf'] as const;
export const isWallType = (t: string) => (WALL_TYPES as readonly string[]).includes(t);

/** Which way a piece on each wall faces (degrees, 0 = +y), as the engine uses. */
const ROT: Record<Wall, number> = { back: 0, left: 90, right: 270, front: 180 };
const DOOR_HEIGHT = 2.1;
const GAP = 0.1; // breathing room between two wall pieces

export const wallLength = (plan: FloorPlan, wall: Wall) => (wall === 'back' || wall === 'front' ? plan.width : plan.depth);

/** Where a piece sits on the floor plan when hung at `u` metres along `wall`, its back on the wall. */
export function wallPose(plan: FloorPlan, wall: Wall, u: number, depth: number) {
  const off = depth / 2 + 0.005;
  const p = { back: { x: u, y: off }, front: { x: u, y: plan.depth - off }, left: { x: off, y: u }, right: { x: plan.width - off, y: u } }[wall];
  const mm = (v: number) => Math.round(v * 1000) / 1000;
  return { x: mm(p.x), y: mm(p.y), rotation: ROT[wall] };
}

/** A wall piece's extent along its wall and up it. */
interface Extent { a: number; b: number; lo: number; hi: number; what: string }

const along = (wall: Wall, o: { position: { x: number; y: number } }) => (wall === 'back' || wall === 'front' ? o.position.x : o.position.y);

/** Everything already taking up a wall: windows, doors, and wall pieces (art centred on its height, shelves too). */
export function wallObstacles(plan: FloorPlan, data: LayoutData, wall: Wall, ignoreId?: string): Extent[] {
  const out: Extent[] = [];
  for (const w of plan.windows.filter((w) => w.wall === wall))
    out.push({ a: w.position - w.width / 2, b: w.position + w.width / 2, lo: w.sill, hi: w.head, what: `window ${w.id}` });
  for (const d of plan.doors.filter((d) => d.wall === wall))
    out.push({ a: d.position - d.width / 2, b: d.position + d.width / 2, lo: 0, hi: DOOR_HEIGHT, what: `door ${d.id}` });
  for (const o of data.objects)
    if (o.id !== ignoreId && isWallType(o.type) && (o.wall as string | undefined) === wall) {
      const u = along(wall, o);
      out.push({ a: u - o.size.w / 2, b: u + o.size.w / 2, lo: o.position.z - o.size.h / 2, hi: o.position.z + o.size.h / 2, what: o.id });
    }
  return out;
}

/** Problems with hanging a piece of `size` centred at (u, z) on `wall`. Empty = fine. */
export function wallClashes(plan: FloorPlan, data: LayoutData, wall: Wall, u: number, z: number, size: Size, ignoreId?: string): string[] {
  const a = u - size.w / 2, b = u + size.w / 2, lo = z - size.h / 2, hi = z + size.h / 2;
  const problems: string[] = [];
  if (a < 0.05 || b > wallLength(plan, wall) - 0.05) problems.push(`doesn't fit on the ${wall} wall there`);
  if (lo < 0.3 || hi > plan.wallHeight - 0.05) problems.push('too high or too low for this wall');
  for (const e of wallObstacles(plan, data, wall, ignoreId))
    if (a < e.b + GAP && b > e.a - GAP && lo < e.hi + GAP && hi > e.lo - GAP) problems.push(`overlaps ${e.what}`);
  return problems;
}

/** Tall furniture standing in front of that stretch of wall would hide the piece. */
export function hiddenBehind(data: LayoutData, plan: FloorPlan, wall: Wall, u: number, z: number, size: Size): string[] {
  const offWall = (o: PlacedObject) => ({ back: o.position.y, front: plan.depth - o.position.y, left: o.position.x, right: plan.width - o.position.x })[wall];
  return data.objects
    .filter((o) => o.mount === 'floor' && o.size.h > z - size.h / 2 + 0.2 && offWall(o) - o.size.d / 2 < 0.4)
    .filter((o) => Math.abs(along(wall, o) - u) < (o.size.w + size.w) / 2)
    .map((o) => o.id);
}

/** Best free spot for a piece: widest clear stretch on a visible wall, at eye height (~145 cm centre). */
export function findWallSpot(plan: FloorPlan, data: LayoutData, size: Size, walls: Wall[]): { wall: Wall; u: number; z: number } | null {
  const z = Math.max(1.45, size.h / 2 + 0.9);
  let best: { wall: Wall; u: number; z: number; room: number } | null = null;
  for (const wall of walls) {
    const L = wallLength(plan, wall);
    for (let u = size.w / 2 + 0.1; u <= L - size.w / 2 - 0.1; u += 0.05) {
      if (wallClashes(plan, data, wall, u, z, size).length || hiddenBehind(data, plan, wall, u, z, size).length) continue;
      // prefer spots with the most clear wall around them (centred in a free stretch)
      const obstacles = wallObstacles(plan, data, wall);
      const left = Math.min(u - size.w / 2, ...obstacles.filter((e) => e.b <= u).map((e) => u - size.w / 2 - e.b));
      const right = Math.min(L - u - size.w / 2, ...obstacles.filter((e) => e.a >= u).map((e) => e.a - u - size.w / 2));
      const room = Math.min(left, right);
      if (!best || room > best.room) best = { wall, u, z, room };
    }
  }
  return best && { wall: best.wall, u: Math.round(best.u * 100) / 100, z: best.z };
}
