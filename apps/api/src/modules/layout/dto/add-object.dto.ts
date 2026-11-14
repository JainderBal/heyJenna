import { z } from 'zod';
import { Wall } from '@hey-jenna/contracts';

/**
 * POST /rooms/:roomId/layouts/:layoutId/objects: add one of the room's products to the layout.
 * Wall pieces (picture, mirror, wall shelf): optional wall/position/height; left out, the best free spot on a visible wall is found.
 * Floor pieces (armchair, side table, pouf, plant, floor lamp, shelf, sideboard, rug…): optional x/y/rotationDeg;
 * left out, the best free floor spot is found (beside a seat, in a corner, against a wall… depending on the piece).
 */
export const AddObjectSchema = z
  .object({
    listingId: z.string().uuid(),
    wall: Wall.optional(),
    /** Wall pieces: metres along the wall to the piece's centre (back/front: from the left wall; left/right: from the back wall). */
    position: z.number().min(0).max(30).optional(),
    /** Wall pieces: height of the piece's centre above the floor, metres (default ~1.45). */
    height: z.number().min(0.3).max(5).optional(),
    /** Floor pieces: centre on the floor plan, metres (x from the left wall, y from the back wall). */
    x: z.number().min(0).max(30).optional(),
    y: z.number().min(0).max(30).optional(),
    /** Floor pieces: which way it faces, degrees (0 faces the front wall, 90 the right wall). */
    rotationDeg: z.number().min(-360).max(720).optional(),
  })
  .refine((v) => (v.x === undefined) === (v.y === undefined), 'Send both x and y, or neither')
  .refine(
    (v) => (v.x === undefined && v.rotationDeg === undefined) || (v.wall === undefined && v.position === undefined && v.height === undefined),
    'Use x/y/rotationDeg for floor pieces or wall/position/height for wall pieces, not both',
  );
export type AddObjectDto = z.infer<typeof AddObjectSchema>;
