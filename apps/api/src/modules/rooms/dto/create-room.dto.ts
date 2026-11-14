import { z } from 'zod';
import { FloorPlan } from '@hey-jenna/contracts';

/** POST /rooms: a name, the hand-drawn floor plan, and what the person needs from the room. */
export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(120),
  floorPlan: FloorPlan,
  needs: z.array(z.string().min(1).max(200)).max(20).default([]),
});
export type CreateRoomDto = z.infer<typeof CreateRoomSchema>;
