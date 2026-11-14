import { HttpException, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Job, Prisma } from '@prisma/client';
import { hostname } from 'os';
import { AppConfig } from '../config/app-config.service';
import { RoomEventsService } from '../events/events.service';
import { JobsRepository, NewJob } from './jobs.repository';

/** Does the work. What it returns is stored as the job's result (keep it small). */
export type JobHandler = (job: Job) => Promise<Prisma.InputJsonValue | void>;

/**
 * General background jobs: enqueue from anywhere, run by this in-process runner.
 * Modules register a handler per kind (e.g. "listing_search") in onModuleInit.
 * Render jobs keep their own table and external workers (render_jobs).
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(JobsService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly runnerId = `${hostname()}:${process.pid}`;
  private timer?: NodeJS.Timeout;
  private running = 0;
  private ticking = false;
  private stopped = true;

  constructor(private readonly repo: JobsRepository, private readonly events: RoomEventsService, private readonly config: AppConfig) {}

  register(kind: string, handler: JobHandler): void {
    if (this.handlers.has(kind)) throw new Error(`job kind ${kind} registered twice`);
    this.handlers.set(kind, handler);
  }

  async enqueue(job: NewJob): Promise<Job> {
    const saved = await this.repo.create(job);
    this.announce('job.queued', saved);
    void this.tick(); // start now if a slot is free instead of waiting for the next poll
    return saved;
  }

  findInRoom(id: string, roomId: string): Promise<Job | null> {
    return this.repo.findInRoom(id, roomId);
  }

  onApplicationBootstrap(): void {
    if (this.config.get('JOBS_RUNNER') !== 'on') return;
    this.stopped = false;
    this.timer = setInterval(() => void this.tick(), this.config.get('JOBS_POLL_MS'));
    this.timer.unref();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** Claim and start jobs until the runner is full or nothing is due. */
  async tick(): Promise<void> {
    if (this.stopped || this.ticking) return;
    this.ticking = true;
    try {
      while (!this.stopped && this.running < this.config.get('JOBS_CONCURRENCY')) {
        const job = await this.repo.claimNext([...this.handlers.keys()], this.runnerId);
        if (!job) break;
        this.running++;
        void this.run(job).finally(() => {
          this.running--;
          void this.tick();
        });
      }
    } catch (e) {
      this.log.error(`claiming jobs failed: ${(e as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  /** Run one claimed job; never throws. */
  async run(job: Job): Promise<Job> {
    this.announce('job.running', job);
    try {
      const result = await this.handlers.get(job.kind)!(job);
      const done = await this.repo.complete(job.id, result ?? undefined);
      this.announce('job.done', done);
      return done;
    } catch (e) {
      const message = (e as Error).message ?? String(e);
      // a 4xx (e.g. "upload a moodboard first") won't fix itself on retry
      const final = e instanceof HttpException && e.getStatus() < 500;
      const after = await this.repo.fail(job, message, final);
      this.log.warn(`job ${job.kind} ${job.id} attempt ${job.attempts} failed${after.status === 'queued' ? ', will retry' : ''}: ${message}`);
      this.announce(after.status === 'queued' ? 'job.queued' : 'job.failed', after);
      return after;
    }
  }

  private announce(type: 'job.queued' | 'job.running' | 'job.done' | 'job.failed', job: Job): void {
    if (!job.roomId) return;
    this.events.publish(job.roomId, type, {
      jobId: job.id, kind: job.kind, status: job.status, attempts: job.attempts,
      ...(job.error ? { error: job.error } : {}), ...(job.result != null ? { result: job.result } : {}),
      ...(type === 'job.queued' && job.attempts > 0 ? { retryAt: job.runAfter.toISOString() } : {}),
    });
  }
}
