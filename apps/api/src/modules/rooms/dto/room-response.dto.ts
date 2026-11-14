import { FloorPlan } from '@hey-jenna/contracts';

/** What the API sends back for a room (never the raw database row). */
export interface RoomResponseDto {
  id: string;
  name: string;
  floorPlan: FloorPlan;
  needs: string[];
  projectId: string | null;
  areaM2: number;
  createdAt: string;
  updatedAt: string;
}
