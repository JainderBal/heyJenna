import { z } from 'zod';

/** PATCH /rooms/:roomId/layouts/:layoutId/objects/:objectId: move/turn a piece, or swap its product. */
export const EditObjectSchema = z
  .object({
    x: z.number().min(0).max(30),
    y: z.number().min(0).max(30),
    rotationDeg: z.number().min(-360).max(720),
    /** Put a different product (same type) in this spot. */
    listingId: z.string().uuid(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Send x, y, rotationDeg or listingId');
export type EditObjectDto = z.infer<typeof EditObjectSchema>;
