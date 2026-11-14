import { z } from 'zod';
import { CreateRoomSchema } from './create-room.dto';

/** PATCH /rooms/:id: any of the create fields. */
export const UpdateRoomSchema = CreateRoomSchema.partial();
export type UpdateRoomDto = z.infer<typeof UpdateRoomSchema>;
