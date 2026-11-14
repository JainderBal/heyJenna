import { z } from 'zod';
import { FurnitureType } from '@hey-jenna/contracts';

/** GET /rooms/:roomId/listings?type=sofa */
export const ListListingsSchema = z.object({ type: FurnitureType.optional() });
export type ListListingsDto = z.infer<typeof ListListingsSchema>;
