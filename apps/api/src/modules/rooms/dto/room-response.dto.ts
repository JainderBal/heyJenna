import { FloorPlan } from '@hey-jenna/contracts';

/** What the API sends back for a room (never the raw database row). */
export interface RoomResponseDto {
  id: string;
  name: string;
  floorPlan: FloorPlan;
  needs: string[];
  areaM2: number;
  createdAt: string;
  updatedAt: string;
}
