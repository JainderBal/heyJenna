import { z } from 'zod';
import { FloorPlan, PlanPosition, RoomKind } from '@hey-jenna/contracts';

/** POST /rooms: a name, the hand-drawn floor plan, and what the person needs from the room. */
export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(120),
  floorPlan: FloorPlan,
  needs: z.array(z.string().min(1).max(200)).max(20).default([]),
  kind: RoomKind.optional(),
  /** false = on the plan only: no products, no layout. Defaults from `kind` (closets, laundry… are not furnished). */
  furnish: z.boolean().optional(),
  /** Optional project this room belongs to (must be the caller's). null = no project. */
  projectId: z.string().uuid().nullable().optional(),
  /** Where the room sits on its project's plan, metres from the top-left. null = not placed. */
  planPosition: PlanPosition.nullable().optional(),
});
export type CreateRoomDto = z.infer<typeof CreateRoomSchema>;
