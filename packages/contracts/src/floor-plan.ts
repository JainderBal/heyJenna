import { z } from 'zod';

/**
 * A room drawn by hand (or traced from a floor plan). Metres.
 * x runs left wall → right wall (0..width), y runs back wall → front wall (0..depth).
 * Openings sit on a wall; `position` is the centre of the opening measured along that wall.
 */
export const Wall = z.enum(['back', 'left', 'right', 'front']);
export type Wall = z.infer<typeof Wall>;

export const Window = z.object({
  id: z.string(),
  wall: Wall,
  position: z.number().nonnegative(),
  width: z.number().positive(),
  sill: z.number().nonnegative().default(0.8),
  head: z.number().positive().default(2.1),
  view: z.enum(['plain', 'street', 'garden', 'park', 'sea', 'skyline', 'good']).default('plain'),
});

export const Door = z.object({
  id: z.string(),
  wall: Wall,
  position: z.number().nonnegative(),
  width: z.number().positive(),
  swing: z.enum(['in', 'out', 'none']).default('in'),
});

export const WallFinish = z.object({
  finish: z.string().default('paint'),
  colour: z.string().optional(),
  feature: z.boolean().optional(),
  /** No wall here: the room opens onto its neighbour (open-plan kitchen / dining / living). */
  open: z.boolean().optional(),
});

/** Smallest side a room may have, in metres (a closet or a storage nook). */
export const MIN_ROOM_SIDE = 0.6;

export const FloorPlan = z.object({
  width: z.number().min(MIN_ROOM_SIDE).max(30),
  depth: z.number().min(MIN_ROOM_SIDE).max(30),
  wallHeight: z.number().min(2).max(6).default(2.6),
  floor: z.string().default('wood'),
  walls: z.record(Wall, WallFinish).default({}),
  windows: z.array(Window).default([]),
  doors: z.array(Door).default([]),
  /** Fireplaces etc. that can become the focal point. */
  features: z.array(z.object({ type: z.string(), wall: Wall, position: z.number() })).default([]),
});
export type FloorPlan = z.infer<typeof FloorPlan>;

/**
 * Where a room sits on its project's floor plan drawing: metres from the plan's top-left corner
 * (x to the right, y down the page). null/absent = not placed yet (the studio packs it).
 */
export const PlanPosition = z.object({
  x: z.number().finite().min(-500).max(500),
  y: z.number().finite().min(-500).max(500),
});
export type PlanPosition = z.infer<typeof PlanPosition>;

/** The walls that are open to a neighbouring room (nothing to put furniture or art against). */
export const openWalls = (plan: Pick<FloorPlan, 'walls'>): Wall[] =>
  (Object.entries(plan.walls ?? {}) as [Wall, { open?: boolean }][]).filter(([, f]) => f?.open).map(([w]) => w);

/** What a room is for. Closets, laundry, halls and balconies are kept on the plan but not furnished by default. */
export const RoomKind = z.enum([
  'living', 'kitchen', 'dining', 'bedroom', 'bathroom', 'office',
  'laundry', 'closet', 'storage', 'hallway', 'entry', 'balcony', 'other',
]);
export type RoomKind = z.infer<typeof RoomKind>;

/**
 * Kinds the layout engine can furnish today. It designs living spaces (sofa group, desk, shelves…); bedrooms, dining
 * rooms, kitchens and bathrooms need furniture it doesn't know yet (beds, dining tables…), so they stay on the plan only.
 * Rooms with no kind (drawn by hand, or made before kinds) are treated as living spaces.
 */
export const FURNISHABLE_KINDS: readonly RoomKind[] = ['living', 'office', 'other'];
export const canFurnish = (kind: RoomKind | null | undefined): boolean => !kind || FURNISHABLE_KINDS.includes(kind);
export const furnishedByDefault = canFurnish;
