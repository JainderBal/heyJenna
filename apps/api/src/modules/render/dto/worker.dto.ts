import { z } from 'zod';

export const ClaimSchema = z.object({ workerId: z.string().min(1).max(100) });
export type ClaimDto = z.infer<typeof ClaimSchema>;

export const FailSchema = z.object({ error: z.string().min(1).max(5000) });
export type FailDto = z.infer<typeof FailSchema>;
