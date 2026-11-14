/**
 * Floor-plan helpers: the prototype's sample plan, and where each room sits on the plan drawing.
 * The API stores each room's own size only, not where it sits in the home, so positions are kept
 * in this browser (localStorage) when we know them (sample plan, floor-plan read) and packed
 * left-to-right otherwise.
 */
import type { BulkRoomInput, FloorPlan } from '@hey-jenna/contracts';
import type { Room } from '../api/types';

/** name, x, z, w, d, kind (metres). From the prototype's PLANS. */
export type PlanRow = [name: string, x: number, z: number, w: number, d: number, kind: string];

export const PLANS: Record<'flat' | 'house' | 'studio', PlanRow[]> = {
  flat: [['Living room', 0, 0, 4.2, 3.6, 'sofa'], ['Kitchen', 4.2, 0, 2.6, 3.6, 'kitchen'], ['Bedroom', 0, 3.6, 3.4, 3.0, 'bed'], ['Bathroom', 3.4, 3.6, 1.6, 3.0, 'bath'], ['Office', 5.0, 3.6, 1.8, 3.0, 'desk']],
  house: [['Living room', 0, 0, 5, 4, 'sofa'], ['Dining room', 5, 0, 3.2, 4, 'dining'], ['Kitchen', 8.2, 0, 2.8, 4, 'kitchen'], ['Bedroom', 0, 4, 4, 3.4, 'bed'], ['Guest room', 4, 4, 3.4, 3.4, 'bed'], ['Bathroom', 7.4, 4, 3.6, 3.4, 'bath']],
  studio: [['Living room', 0, 0, 5.2, 4.4, 'sofa'], ['Sleeping nook', 5.2, 0, 2.6, 2.6, 'bed'], ['Bathroom', 5.2, 2.6, 2.6, 1.8, 'bath']],
};

/** A plain rectangular room, no openings. The API's FloorPlan needs 1.5–30 m per side. */
export const floorPlanOf = (width: number, depth: number): FloorPlan => ({
  width: Math.min(30, Math.max(1.5, width)),
  depth: Math.min(30, Math.max(1.5, depth)),
  wallHeight: 2.6,
  floor: 'wood',
  walls: {},
  windows: [],
  doors: [],
  features: [],
});

/** Bulk-create body for a sample plan. */
export const sampleRooms = (plan: PlanRow[]): BulkRoomInput[] => plan.map(([name, , , w, d]) => ({ name, needs: [], floorPlan: floorPlanOf(w, d) }));

/** The prototype's palettes; a project without its own palette gets `motel`. */
export const PALS = {
  warm: ['#B9733A', '#2F5C7E', '#F6E878', '#E2A28A', '#F6F0E0', '#6B4B3E'],
  sage: ['#90A096', '#F5EFE4', '#B9A585', '#5F7F87', '#E2D7C6', '#433B29'],
  motel: ['#2B5391', '#D6483C', '#F6F0E4', '#E4B04A', '#7FB7C9', '#27231D'],
  rose: ['#E2A28A', '#F4EEE7', '#B9A4D9', '#2E8B7A', '#E8955A', '#6B4B3E'],
  forest: ['#3E7D55', '#F6E878', '#E8955A', '#F6F0E0', '#2A3A26', '#B9733A'],
};
export const DEFAULT_PALETTE = PALS.motel;

/* ---------- where rooms sit on the plan ---------- */

type Spots = Record<string, { x: number; z: number }>;
const KEY = (projectId: string) => `hj-plan-pos:${projectId}`;

export function savePlanSpots(projectId: string, rooms: Room[], spots: { x: number; z: number }[]) {
  try {
    const all: Spots = JSON.parse(localStorage.getItem(KEY(projectId)) || '{}');
    rooms.forEach((r, i) => {
      if (spots[i]) all[r.id] = spots[i];
    });
    localStorage.setItem(KEY(projectId), JSON.stringify(all));
  } catch {
    /* private mode: positions are packed instead */
  }
}

function loadSpots(projectId: string): Spots {
  try {
    return JSON.parse(localStorage.getItem(KEY(projectId)) || '{}');
  } catch {
    return {};
  }
}

export interface PlacedRoom {
  room: Room;
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Every room with a spot on the plan: the stored one, else packed in rows below the known ones. */
export function placeRooms(projectId: string, rooms: Room[]): PlacedRoom[] {
  const spots = loadSpots(projectId);
  const out: PlacedRoom[] = [];
  const loose: Room[] = [];
  for (const room of rooms) {
    const s = spots[room.id];
    if (s) out.push({ room, x: s.x, z: s.z, w: room.floorPlan.width, d: room.floorPlan.depth });
    else loose.push(room);
  }
  if (!loose.length) return out;
  const total = loose.reduce((a, r) => a + r.floorPlan.width * r.floorPlan.depth, 0);
  const rowMax = Math.max(6, Math.sqrt(total) * 1.6, ...out.map((p) => p.x + p.w));
  let x = 0;
  let z = out.length ? Math.max(...out.map((p) => p.z + p.d)) : 0;
  let rowD = 0;
  for (const room of loose) {
    const { width: w, depth: d } = room.floorPlan;
    if (x > 0 && x + w > rowMax) {
      x = 0;
      z += rowD;
      rowD = 0;
    }
    out.push({ room, x, z, w, d });
    x += w;
    rowD = Math.max(rowD, d);
  }
  return out;
}

/** "4.2 × 3.6 m" */
export const dims = (r: Room) => `${trim(r.floorPlan.width)} × ${trim(r.floorPlan.depth)} m`;
const trim = (n: number) => String(Math.round(n * 100) / 100);
