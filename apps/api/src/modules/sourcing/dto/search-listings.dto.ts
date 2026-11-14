import { z } from 'zod';
import { FurnitureType } from '@hey-jenna/contracts';

/** POST /rooms/:roomId/listings/search */
export const SearchListingsSchema = z.object({
  /** Only these types (default: the room's whole shopping list). */
  types: z.array(FurnitureType).max(16).optional(),
  /** How many results to keep per type. */
  perType: z.number().int().min(1).max(20).default(6),
  /** Only keep listings at or under this price (CAD). */
  maxPrice: z.number().positive().optional(),
});
export type SearchListingsDto = z.infer<typeof SearchListingsSchema>;
