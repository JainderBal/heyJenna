import { z } from 'zod';
import { FurnitureType, Size } from './furniture';

export const ListingSource = z.enum(['ebay', 'kijiji', 'facebook', 'ikea', 'web', 'link', 'mock']);
export type ListingSource = z.infer<typeof ListingSource>;

/** One buyable product. We keep the minimum: no seller details, photos are linked not copied. */
export const Listing = z.object({
  source: ListingSource,
  externalId: z.string(),
  url: z.string().url(),
  title: z.string(),
  type: FurnitureType,
  price: z.number().nonnegative().nullable(),
  currency: z.string().default('CAD'),
  imageUrl: z.string().url().nullable(),
  condition: z.enum(['new', 'used', 'unknown']).default('unknown'),
  location: z.string().nullable(),
  size: Size.nullable(),
  sizeEstimated: z.boolean(),
  colours: z.array(z.string()).default([]),
});
export type Listing = z.infer<typeof Listing>;
