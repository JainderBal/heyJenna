import { ConflictException } from '@nestjs/common';
import { Job } from '@prisma/client';
import { RoomEventsService } from '../events/events.service';
import { JobsRepository } from './jobs.repository';
import { JobsService } from './jobs.service';
import { afterFailure } from './retry';

describe('afterFailure', () => {
  const now = new Date('2026-11-12T00:00:00Z');
  it('retries with doubling backoff while attempts remain', () => {
    expect(afterFailure(1, 3, now)).toEqual({ status: 'queued', runAfter: new Date(now.getTime() + 5_000) });
    expect(afterFailure(2, 3, now)).toEqual({ status: 'queued', runAfter: new Date(now.getTime() + 10_000) });
  });
  it('caps the backoff at 5 minutes', () => {
    expect(afterFailure(20, 99, now)).toEqual({ status: 'queued', runAfter: new Date(now.getTime() + 300_000) });
  });
  it('fails for good on the last attempt', () => {
    expect(afterFailure(3, 3, now)).toEqual({ status: 'failed' });
    expect(afterFailure(1, 1, now)).toEqual({ status: 'failed' });
  });
});

/** In-memory stand-in for the jobs table with the same claim rules as the SQL. */
class FakeRepo {
  jobs: Job[] = [];
  claimedKinds: string[][] = [];
  async create(j: { kind: string; payload: unknown; roomId?: string; maxAttempts?: number }): Promise<Job> {
    const job = {
      id: `job-${this.jobs.length + 1}`, kind: j.kind, payload: j.payload, roomId: j.roomId ?? null, status: 'queued', attempts: 0,
      maxAttempts: j.maxAttempts ?? 3, runAfter: new Date(0), lockedBy: null, result: null, error: null,
      createdAt: new Date(), startedAt: null, finishedAt: null,
    } as Job;
    this.jobs.push(job);
    return { ...job };
  }
  async claimNext(kinds: string[], runnerId: string): Promise<Job | null> {
    this.claimedKinds.push(kinds);
    const job = this.jobs.find((j) => kinds.includes(j.kind) && j.status === 'queued' && j.runAfter <= new Date() && j.attempts < j.maxAttempts);
    if (!job) return null;
    Object.assign(job, { status: 'running', lockedBy: runnerId, attempts: job.attempts + 1, startedAt: new Date() });
    return { ...job };
  }
  async complete(id: string, result: unknown): Promise<Job> {
    const job = this.jobs.find((j) => j.id === id)!;
    Object.assign(job, { status: 'done', result: result ?? null, lockedBy: null });
    return { ...job };
  }
  async fail(j: Job, error: string, final = false): Promise<Job> {
    const job = this.jobs.find((x) => x.id === j.id)!;
    const next = final ? { status: 'failed' } : afterFailure(job.attempts, job.maxAttempts);
    Object.assign(job, { error, lockedBy: null, ...(next.status === 'queued' ? { status: 'queued', runAfter: new Date(0) } : { status: 'failed' }) });
    return { ...job };
  }
  async findInRoom() { return null; }
}

function setup() {
  const repo = new FakeRepo();
  const events = new RoomEventsService();
  const seen: string[] = [];
  events.subscribe('room-1', (e) => seen.push(`${e.type}:${(e.data as { status: string }).status}`));
  const config = { get: (k: string) => ({ JOBS_RUNNER: 'off', JOBS_POLL_MS: 1000, JOBS_CONCURRENCY: 2 })[k] };
  const jobs = new JobsService(repo as unknown as JobsRepository, events, config as never);
  (jobs as unknown as { stopped: boolean }).stopped = false; // runner on, but driven by hand (no timer)
  return { repo, jobs, seen };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('JobsService runner', () => {
  it('runs a job, stores its result and announces each step to the room', async () => {
    const { repo, jobs, seen } = setup();
    jobs.register('echo', async (job) => ({ got: job.payload as never }));
    await jobs.enqueue({ kind: 'echo', payload: { n: 1 }, roomId: 'room-1' });
    await flush(); await flush();
    expect(repo.jobs[0]).toMatchObject({ status: 'done', attempts: 1, result: { got: { n: 1 } } });
    expect(seen).toEqual(['job.queued:queued', 'job.running:running', 'job.done:done']);
  });

  it('retries a failing job, then fails it for good after maxAttempts', async () => {
    const { repo, jobs, seen } = setup();
    let calls = 0;
    jobs.register('flaky', async () => { calls++; throw new Error('boom'); });
    const job = await jobs.enqueue({ kind: 'flaky', payload: {}, roomId: 'room-1', maxAttempts: 2 });
    for (let i = 0; i < 6; i++) await flush();
    expect(calls).toBe(2);
    expect(repo.jobs.find((j) => j.id === job.id)).toMatchObject({ status: 'failed', attempts: 2, error: 'boom' });
    expect(seen).toEqual(['job.queued:queued', 'job.running:running', 'job.queued:queued', 'job.running:running', 'job.failed:failed']);
  });

  it('does not retry a 4xx error', async () => {
    const { repo, jobs } = setup();
    jobs.register('bad', async () => { throw new ConflictException('Upload a moodboard first'); });
    await jobs.enqueue({ kind: 'bad', payload: {}, roomId: 'room-1' });
    for (let i = 0; i < 4; i++) await flush();
    expect(repo.jobs[0]).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('only claims kinds it has a handler for', async () => {
    const { repo, jobs } = setup();
    jobs.register('known', async () => undefined);
    await jobs.enqueue({ kind: 'other', payload: {} });
    await flush();
    expect(repo.claimedKinds.every((k) => k.length === 1 && k[0] === 'known')).toBe(true);
    expect(repo.jobs[0].status).toBe('queued');
  });

  it('never runs more jobs at once than JOBS_CONCURRENCY', async () => {
    const { jobs } = setup();
    let active = 0, peak = 0;
    const gates: (() => void)[] = [];
    jobs.register('slow', () => { active++; peak = Math.max(peak, active); return new Promise((r) => gates.push(() => { active--; r(undefined); })); });
    for (let i = 0; i < 5; i++) await jobs.enqueue({ kind: 'slow', payload: {} });
    await flush();
    expect(peak).toBe(2);
    while (gates.length) { gates.shift()!(); await flush(); await flush(); }
    expect(peak).toBe(2);
  });
});
