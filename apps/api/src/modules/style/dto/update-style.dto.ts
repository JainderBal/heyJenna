import { z } from 'zod';

const Hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** PATCH /rooms/:roomId/style: the person tweaks what the moodboard produced. */
export const UpdateStyleSchema = z
  .object({
    name: z.string().min(1).max(60),
    keywords: z.array(z.string().min(1).max(40)).min(1).max(12),
    vibe: z.array(z.string().min(1).max(40)).max(12),
    palette: z.object({ dominant: z.array(Hex).min(1), secondary: z.array(Hex).min(1), accent: z.array(Hex).min(1) }),
    shapeFamily: z.enum(['retro', 'modern', 'garden']),
    stylingDensity: z.enum(['sparse', 'balanced', 'layered']),
  })
  .partial();
export type UpdateStyleDto = z.infer<typeof UpdateStyleSchema>;
