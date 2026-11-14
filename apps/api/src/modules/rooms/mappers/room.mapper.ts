import { Room } from '@prisma/client';
import { FloorPlan } from '@hey-jenna/contracts';
import { RoomResponseDto } from '../dto/room-response.dto';

/** Database row → response DTO. */
export function toRoomResponse(room: Room): RoomResponseDto {
  const floorPlan = room.floorPlan as unknown as FloorPlan;
  return {
    id: room.id,
    name: room.name,
    floorPlan,
    needs: room.needs,
    projectId: room.projectId,
    areaM2: Math.round(floorPlan.width * floorPlan.depth * 100) / 100,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  };
}
