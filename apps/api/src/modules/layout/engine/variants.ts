import { EngineResult, EngineSpec, LayoutEngine } from './layout-engine';
import { Dropped, solveWithRepairs } from './repair';

/**
 * Real design choices a designer would sketch side by side:
 * where the seating group sits (facing the focal wall or framing it), whether the armchair makes a
 * reading spot or joins the sofa, sofa against the wall or floating, which side people walk past.
 */
const VARIANTS: Record<string, unknown>[] = [
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

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * How loose the seating group is: every sofa/armchair should sit within about 1.8 m of the coffee
 * table (centre to centre) so people can talk and reach it. Metres beyond that, summed.
 */
function seatingSpread(r: EngineResult): number {
  const table = r.objects.find((o) => o.type === 'coffee_table');
  if (!table) return 0;
  return r.objects
    .filter((o) => o.type === 'sofa' || o.type === 'armchair')
    .reduce((sum, seat) => sum + Math.max(0, dist(seat.position, table.position) - 1.8), 0);
}

/** Extras the engine added to fill empty floor (stools, small tables): a few are fine, many read as clutter. */
function fillerCount(r: EngineResult): number {
  return r.objects.filter((o) => o.id.startsWith('fill_') && o.layer !== 'plants').length;
}

/** Lower is better: broken rules and pieces left out (5 pieces cost more than one broken rule) > a loose seating group > warnings > clutter. */
function badness(r: EngineResult, dropped: Dropped[]): number {
  return r.summary.fail * 100 + dropped.length * 25 + seatingSpread(r) * 15 + r.summary.warn * 3 + fillerCount(r) * 2;
}

/** Lays the room out every way in VARIANTS (in parallel, each auto-repaired) and keeps the best. */
export async function solveBestVariant(engine: LayoutEngine, spec: EngineSpec): Promise<Solved> {
  const runs = await Promise.allSettled(VARIANTS.map(async (variant) => ({ variant, ...(await solveWithRepairs(engine, { ...spec, variant })) })));
  const ok = runs.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (!ok.length) throw (runs[0] as PromiseRejectedResult).reason; // every variant failed: report the first error
  ok.sort((a, b) => badness(a.result, a.dropped) - badness(b.result, b.dropped));
  for (const o of ok)
    console.log(`  variant ${JSON.stringify(o.variant)}: fails ${o.result.summary.fail}, dropped ${o.dropped.length}, seating spread ${seatingSpread(o.result).toFixed(2)} m, warns ${o.result.summary.warn}, fillers ${fillerCount(o.result)} → ${badness(o.result, o.dropped).toFixed(1)}`);
  return { ...ok[0], tried: ok.length };
}
