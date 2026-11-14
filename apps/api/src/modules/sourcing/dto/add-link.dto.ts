import { z } from 'zod';
import { FurnitureType } from '@hey-jenna/contracts';

/** POST /rooms/:roomId/listings/link: a product the person found themselves. */
export const AddLinkSchema = z.object({
  url: z.string().url().startsWith('https://'),
  /** Set it if the title doesn't make the type obvious. */
  type: FurnitureType.optional(),
});
export type AddLinkDto = z.infer<typeof AddLinkSchema>;
