import { FloorPlan, PlanPosition } from '@hey-jenna/contracts';

/** What the API sends back for a room (never the raw database row). */
export interface RoomResponseDto {
  id: string;
  name: string;
  floorPlan: FloorPlan;
  needs: string[];
  projectId: string | null;
  /** Where the room sits on its project's plan (metres from the top-left), or null when not placed. */
  planPosition: PlanPosition | null;
  areaM2: number;
  createdAt: string;
  updatedAt: string;
}
