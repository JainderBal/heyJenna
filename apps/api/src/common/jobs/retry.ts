/** What happens to a job whose handler threw. Pure, so it's easy to test. */
export type AfterFailure = { status: 'queued'; runAfter: Date } | { status: 'failed' };

const BASE_MS = 5_000;
const MAX_MS = 5 * 60_000;

/** `attempts` already counts the run that just failed. Backoff 5 s, 10 s, 20 s … capped at 5 min. */
export function afterFailure(attempts: number, maxAttempts: number, now = new Date()): AfterFailure {
  if (attempts >= maxAttempts) return { status: 'failed' };
  const delay = Math.min(MAX_MS, BASE_MS * 2 ** Math.max(0, attempts - 1));
  return { status: 'queued', runAfter: new Date(now.getTime() + delay) };
}
