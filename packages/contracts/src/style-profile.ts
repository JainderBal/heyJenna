import { z } from 'zod';

const Hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** What the moodboard gets turned into. Feeds both product search and the layout engine. */
export const StyleProfile = z.object({
  name: z.string(),
  source: z.string(),
  palette: z.object({
    dominant: z.array(Hex).min(1),   // ~60 %: walls, floor, big surfaces
    secondary: z.array(Hex).min(1),  // ~30 %: large furniture
    accent: z.array(Hex).min(1),     // ~10 %: small pops
  }),
  /** Plain words used to search shops, e.g. ["mid century", "teak", "boucle"]. */
  keywords: z.array(z.string()),
  /** Short vibe tags, e.g. ["70s", "warm", "playful"]. */
  vibe: z.array(z.string()),
  shapeFamily: z.enum(['retro', 'modern', 'garden']).default('retro'),
  materials: z.object({
    wood: Hex.optional(), metal: z.string().optional(), fabric: z.string().optional(),
  }).default({}),
  stylingDensity: z.enum(['sparse', 'balanced', 'layered']).optional(),
  warmth: z.number().min(-1).max(1),       // -1 cool … +1 warm
  saturation: z.number().min(0).max(1),
  lightness: z.number().min(0).max(1),
});
export type StyleProfile = z.infer<typeof StyleProfile>;
