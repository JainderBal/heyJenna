/** What the API sends back for a project (never the raw database row). */
export interface ProjectResponseDto {
  id: string;
  name: string;
  kind: string | null;
  palette: string[];
  /** Furniture budget for the whole home, in CAD. Null means no limit. */
  budgetCad: number | null;
  createdAt: string;
  updatedAt: string;
}
