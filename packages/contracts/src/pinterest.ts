import { z } from 'zod';

export const PinterestBoard = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  pinCount: z.number().int().nullable(),
});
export type PinterestBoard = z.infer<typeof PinterestBoard>;

export const PinterestPin = z.object({
  id: z.string(),
  title: z.string().nullable(),
  imageUrl: z.string().url(),
  size: z.object({ width: z.number(), height: z.number() }),
  link: z.string().nullable(),
});
export type PinterestPin = z.infer<typeof PinterestPin>;

/** Page of results; pass `bookmark` back as ?bookmark= for the next page. */
export const PinterestPage = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), bookmark: z.string().nullable() });

/** A pin the client picked: its image (must be on i.pinimg.com) and where it came from. */
export const PinRef = z.object({
  id: z.string().min(1).max(64),
  imageUrl: z.string().url().startsWith('https://'),
  link: z.string().url().optional(),
});
export type PinRef = z.infer<typeof PinRef>;

export const AddPinsRequest = z.object({ pins: z.array(PinRef).min(1).max(8) });
export const SimilarPinsRequest = z.object({ pins: z.array(PinRef).min(1).max(30) });
export type AddPinsRequest = z.infer<typeof AddPinsRequest>;
export type SimilarPinsRequest = z.infer<typeof SimilarPinsRequest>;
