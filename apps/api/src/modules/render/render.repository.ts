import { Injectable } from '@nestjs/common';
import { RenderJob } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

/** The only place that queries render_jobs. Postgres is the queue. */
@Injectable()
export class RenderRepository {
  constructor(private readonly db: PrismaService) {}

  create(roomId: string, layoutId: string): Promise<RenderJob> {
    return this.db.renderJob.create({ data: { roomId, layoutId } });
  }

  findInRoom(id: string, roomId: string): Promise<RenderJob | null> {
    return this.db.renderJob.findFirst({ where: { id, roomId } });
  }

  findById(id: string): Promise<RenderJob | null> {
    return this.db.renderJob.findUnique({ where: { id } });
  }

  /** An unfinished job for this layout, so pressing "render" twice doesn't queue two. */
  findOpenForLayout(layoutId: string): Promise<RenderJob | null> {
    return this.db.renderJob.findFirst({ where: { layoutId, status: { in: ['queued', 'running'] } }, orderBy: { createdAt: 'desc' } });
  }

  listForRoom(roomId: string): Promise<RenderJob[]> {
    return this.db.renderJob.findMany({ where: { roomId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  /**
   * Atomically hand the oldest waiting job to one worker. SKIP LOCKED means two workers
   * asking at the same moment never get the same job. Jobs stuck "running" for 15 min
   * (a worker crashed) go back in line, up to 3 attempts.
   */
  async claimNext(workerId: string): Promise<RenderJob | null> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      UPDATE render_jobs SET status = 'running', worker_id = ${workerId}, started_at = now(), attempts = attempts + 1
      WHERE id = (
        SELECT id FROM render_jobs
        WHERE (status = 'queued' OR (status = 'running' AND started_at < now() - interval '15 minutes'))
          AND attempts < 3
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id`;
    return rows.length ? this.findById(rows[0].id) : null;
  }

  complete(id: string, imageKey: string, modelKey: string | null): Promise<RenderJob> {
    return this.db.renderJob.update({ where: { id }, data: { status: 'done', imageKey, modelKey, error: null, finishedAt: new Date() } });
  }

  fail(id: string, error: string): Promise<RenderJob> {
    return this.db.renderJob.update({ where: { id }, data: { status: 'failed', error: error.slice(0, 2000), finishedAt: new Date() } });
  }
}
