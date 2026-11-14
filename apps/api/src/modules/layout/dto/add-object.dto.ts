import { z } from 'zod';
import { Wall } from '@hey-jenna/contracts';

/**
 * POST /rooms/:roomId/layouts/:layoutId/objects: hang one of the room's products (picture, mirror, wall shelf).
 * Leave out wall/position/height and the best free spot on a visible wall is found.
 */
export const AddObjectSchema = z.object({
  listingId: z.string().uuid(),
  wall: Wall.optional(),
  /** Metres along the wall to the piece's centre (back/front: from the left wall; left/right: from the back wall). */
  position: z.number().min(0).max(30).optional(),
  /** Height of the piece's centre above the floor, metres (default ~1.45). */
  height: z.number().min(0.3).max(5).optional(),
});
export type AddObjectDto = z.infer<typeof AddObjectSchema>;
