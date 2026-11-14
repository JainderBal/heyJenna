import { Injectable } from '@nestjs/common';
import { Job, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { afterFailure } from './retry';

export interface NewJob {
  kind: string;
  payload: Prisma.InputJsonValue;
  roomId?: string;
  maxAttempts?: number;
  runAfter?: Date;
}

/** The only place that queries the jobs table. Postgres is the queue. */
@Injectable()
export class JobsRepository {
  constructor(private readonly db: PrismaService) {}

  create(job: NewJob): Promise<Job> {
    return this.db.job.create({ data: job });
  }

  findInRoom(id: string, roomId: string): Promise<Job | null> {
    return this.db.job.findFirst({ where: { id, roomId } });
  }

  /**
   * Atomically hand the next due job of these kinds to one runner. SKIP LOCKED means two
   * runners (or API instances) asking at once never get the same job. Jobs stuck "running"
   * for 15 min (process died mid-job) go back in line while attempts remain.
   */
  async claimNext(kinds: string[], runnerId: string): Promise<Job | null> {
    if (!kinds.length) return null;
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      UPDATE jobs SET status = 'running', locked_by = ${runnerId}, started_at = now(), attempts = attempts + 1
      WHERE id = (
        SELECT id FROM jobs
        WHERE kind = ANY(${kinds}::text[])
          AND ((status = 'queued' AND run_after <= now()) OR (status = 'running' AND started_at < now() - interval '15 minutes'))
          AND attempts < max_attempts
        ORDER BY run_after
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id`;
    return rows.length ? this.db.job.findUnique({ where: { id: rows[0].id } }) : null;
  }

  complete(id: string, result: Prisma.InputJsonValue | undefined): Promise<Job> {
    return this.db.job.update({ where: { id }, data: { status: 'done', result, error: null, lockedBy: null, finishedAt: new Date() } });
  }

  /** Back in line with backoff while attempts remain (and the error isn't final), else failed for good. */
  fail(job: Job, error: string, final = false): Promise<Job> {
    const next = final ? ({ status: 'failed' } as const) : afterFailure(job.attempts, job.maxAttempts);
    return this.db.job.update({
      where: { id: job.id },
      data: {
        error: error.slice(0, 2000),
        lockedBy: null,
        ...(next.status === 'queued' ? { status: 'queued', runAfter: next.runAfter } : { status: 'failed', finishedAt: new Date() }),
      },
    });
  }
}
