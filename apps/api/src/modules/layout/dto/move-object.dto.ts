import { z } from 'zod';
import { Wall } from '@hey-jenna/contracts';

/** PATCH /rooms/:roomId/layouts/:layoutId/objects/:objectId: move/turn a piece, or swap its product. */
export const EditObjectSchema = z
  .object({
    x: z.number().min(0).max(30),
    y: z.number().min(0).max(30),
    rotationDeg: z.number().min(-360).max(720),
    /** Put a different product (same type) in this spot. */
    listingId: z.string().uuid(),
    /** Wall pieces: re-hang on another wall, slide along it (metres to centre), or raise/lower (centre height). */
    wall: Wall,
    position: z.number().min(0).max(30),
    height: z.number().min(0.3).max(5),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Send x, y, rotationDeg, listingId, or wall/position/height for a wall piece');
export type EditObjectDto = z.infer<typeof EditObjectSchema>;
