import { RenderJob } from '@prisma/client';
import { RenderJobResponseDto } from '../dto/render-job-response.dto';

export function toRenderJobResponse(j: RenderJob): RenderJobResponseDto {
  const base = `/rooms/${j.roomId}/renders/${j.id}`;
  return {
    id: j.id,
    roomId: j.roomId,
    layoutId: j.layoutId,
    status: j.status as RenderJobResponseDto['status'],
    attempts: j.attempts,
    imageUrl: j.imageKey ? `${base}/image` : null,
    modelUrl: j.modelKey ? `${base}/model` : null,
    error: j.error,
    createdAt: j.createdAt.toISOString(),
    startedAt: j.startedAt?.toISOString() ?? null,
    finishedAt: j.finishedAt?.toISOString() ?? null,
    seconds: j.startedAt && j.finishedAt ? Math.round((j.finishedAt.getTime() - j.startedAt.getTime()) / 1000) : null,
  };
}
