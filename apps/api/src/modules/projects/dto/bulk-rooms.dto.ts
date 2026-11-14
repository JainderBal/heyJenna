import { z } from 'zod';
import { BulkRoomInput } from '@hey-jenna/contracts';

/** POST /projects/:id/rooms/bulk: several floor plans, one room each. */
export const BulkRoomsSchema = z.object({
  rooms: z.array(BulkRoomInput).min(1).max(30),
});
export type BulkRoomsDto = z.infer<typeof BulkRoomsSchema>;
