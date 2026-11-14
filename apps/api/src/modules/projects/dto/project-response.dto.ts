/** What the API sends back for a project (never the raw database row). */
export interface ProjectResponseDto {
  id: string;
  name: string;
  kind: string | null;
  palette: string[];
  createdAt: string;
  updatedAt: string;
}
