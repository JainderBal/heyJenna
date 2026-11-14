import { z } from 'zod';

/** Optional form field next to uploaded files: image links to include in the moodboard. */
export const MoodboardUrlsSchema = z.array(z.string().url().startsWith('https://')).max(8);
