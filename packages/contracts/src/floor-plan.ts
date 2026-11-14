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
});

export const FloorPlan = z.object({
  width: z.number().min(1.5).max(30),
  depth: z.number().min(1.5).max(30),
  wallHeight: z.number().min(2).max(6).default(2.6),
  floor: z.string().default('wood'),
  walls: z.record(Wall, WallFinish).default({}),
  windows: z.array(Window).default([]),
  doors: z.array(Door).default([]),
  /** Fireplaces etc. that can become the focal point. */
  features: z.array(z.object({ type: z.string(), wall: Wall, position: z.number() })).default([]),
});
export type FloorPlan = z.infer<typeof FloorPlan>;
