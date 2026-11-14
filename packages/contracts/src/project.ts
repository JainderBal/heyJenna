import { z } from 'zod';
import { FloorPlan, PlanPosition, RoomKind } from './floor-plan';

const Hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** A home or job that groups rooms. Everything but the name is optional. */
export const ProjectInput = z.object({
  name: z.string().min(1).max(120),
  kind: z.string().min(1).max(60).optional(),
  palette: z.array(Hex).max(12).optional(),
});
export type ProjectInput = z.infer<typeof ProjectInput>;

/** One room in a bulk create: a name and its floor plan (needs optional). */
export const BulkRoomInput = z.object({
  name: z.string().min(1).max(120),
  floorPlan: FloorPlan,
  needs: z.array(z.string().min(1).max(200)).max(20).default([]),
  /** Where it sits on the plan (e.g. from a floor-plan read). */
  planPosition: PlanPosition.nullable().optional(),
  kind: RoomKind.optional(),
  /** false = keep it on the plan but don't find or lay out furniture (closets, laundry…). Defaults from `kind`. */
  furnish: z.boolean().optional(),
});
export type BulkRoomInput = z.infer<typeof BulkRoomInput>;
