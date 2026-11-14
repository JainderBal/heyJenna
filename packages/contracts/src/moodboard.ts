import { z } from 'zod';

/** One stored moodboard image. Pins keep their i.pinimg.com url and link; uploads are served by the API (a path on it). */
export const MoodboardImage = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  source: z.enum(['upload', 'pin']),
  link: z.string().url().optional(),
});
export type MoodboardImage = z.infer<typeof MoodboardImage>;

export const MoodboardImagesResponse = z.object({ images: z.array(MoodboardImage) });
export type MoodboardImagesResponse = z.infer<typeof MoodboardImagesResponse>;

/** A pin image the client picked (dragged or pasted from Pinterest): its image (must be on i.pinimg.com) and where it came from. */
export const PinRef = z.object({
  id: z.string().min(1).max(64),
  imageUrl: z.string().url().startsWith('https://'),
  link: z.string().url().optional(),
});
export type PinRef = z.infer<typeof PinRef>;

export const AddPinsRequest = z.object({ pins: z.array(PinRef).min(1).max(8) });
export type AddPinsRequest = z.infer<typeof AddPinsRequest>;
