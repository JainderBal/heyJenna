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
