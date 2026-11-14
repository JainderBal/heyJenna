export interface RenderJobResponseDto {
  id: string;
  roomId: string;
  layoutId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  attempts: number;
  /** API paths to fetch the results once status is "done". */
  imageUrl: string | null;
  modelUrl: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Seconds the render took. */
  seconds: number | null;
}
