import { FloorPlan, PlanPosition, RoomKind } from '@hey-jenna/contracts';

/** What the API sends back for a room (never the raw database row). */
export interface RoomResponseDto {
  id: string;
  name: string;
  floorPlan: FloorPlan;
  needs: string[];
  kind: RoomKind | null;
  furnish: boolean;
  /** This room's furniture budget in CAD; null until the person sets it. */
  budgetCad: number | null;
  projectId: string | null;
  /** Where the room sits on its project's plan (metres from the top-left), or null when not placed. */
  planPosition: PlanPosition | null;
  areaM2: number;
  createdAt: string;
  updatedAt: string;
}
