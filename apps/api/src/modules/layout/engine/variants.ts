import { EngineResult, EngineSpec, LayoutEngine } from './layout-engine';
import { Dropped, solveWithRepairs } from './repair';

/**
 * Real design choices a designer would sketch side by side:
 * where the seating group sits (facing the focal wall or framing it), whether the armchair makes a
 * reading spot or joins the sofa, sofa against the wall or floating, which side people walk past.
 */
export const VARIANTS: Record<string, unknown>[] = [
  {},
  { orient: 'frames' },
  { lounge: 'conversation' },
  { mount: 'wall' },
  { orient: 'frames', lounge: 'conversation' },
  { lateral: 1 },
];

export interface Solved {
  result: EngineResult;
  dropped: Dropped[];
  variant: Record<string, unknown>;
  tried: number;
}

/** Lower is better: broken rules, then pieces left out, then warnings. */
export function badness(r: EngineResult, dropped: Dropped[]): number {
  return r.summary.fail * 100 + dropped.length * 10 + r.summary.warn;
}

/** Lays the room out every way in VARIANTS (in parallel, each auto-repaired) and keeps the best. */
export async function solveBestVariant(engine: LayoutEngine, spec: EngineSpec): Promise<Solved> {
  const runs = await Promise.allSettled(VARIANTS.map(async (variant) => ({ variant, ...(await solveWithRepairs(engine, { ...spec, variant })) })));
  const ok = runs.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (!ok.length) throw (runs[0] as PromiseRejectedResult).reason; // every variant failed: report the first error
  ok.sort((a, b) => badness(a.result, a.dropped) - badness(b.result, b.dropped));
  return { ...ok[0], tried: ok.length };
}
