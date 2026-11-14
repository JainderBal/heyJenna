import { EngineItem, EngineResult, EngineSpec, LayoutEngine } from './layout-engine';

export interface Dropped {
  id: string;
  name: string;
  why: string;
}

/** Never dropped: without these there is no room. */
const KEEP = new Set(['sofa', 'coffee_table', 'rug', 'desk', 'desk_chair', 'ceiling_light', 'floor_lamp']);

/** When a room is over-full, these go first (nice-to-haves before anything the person asked for). */
const DROP_ORDER: ((f: EngineItem) => boolean)[] = [
  (f) => f.type === 'pouf',
  (f) => f.type === 'sideboard',
  (f) => f.type === 'plant' && !f.id.endsWith('_1'),
  (f) => f.type === 'armchair' && !f.id.endsWith('_1'),
  (f) => f.type === 'side_table' && !f.id.endsWith('_1'),
];

/** Among pieces a failing rule names, drop the least important first; need-driven ones (cat tree…) last. */
const NAMED_ORDER = ['pouf', 'sideboard', 'plant', 'side_table', 'armchair', 'art', 'shelf', 'table_lamp', 'cat_tree'];
const rank = (f: EngineItem) => {
  const i = NAMED_ORDER.indexOf(f.type);
  return i < 0 ? NAMED_ORDER.length : i;
};

/**
 * Runs the engine. While any rule FAILS, takes one thing out and tries again:
 * first the least important extras, then the optional pieces a failing rule names
 * (e.g. "blocked: armchair_1"). Returns the best layout plus what was left out and why.
 */
export async function solveWithRepairs(engine: LayoutEngine, spec: EngineSpec, rounds = 8): Promise<{ result: EngineResult; dropped: Dropped[] }> {
  const dropped: Dropped[] = [];
  let current: EngineSpec = { ...spec, furniture: [...spec.furniture] };
  // the best attempt so far, together with what had been dropped for it
  let best: { result: EngineResult; dropped: Dropped[] } | undefined;
  let noGain = 0; // drops in a row that didn't reduce failures
  for (let round = 0; ; round++) {
    const result = await engine.run(current);
    if (!best || result.summary.fail < best.result.summary.fail) {
      best = { result, dropped: [...dropped] };
      noGain = 0;
    } else noGain++;
    const fails = result.checks.filter((c) => c.status === 'fail');
    // stop when it passes, after `rounds` tries, or when dropping things isn't helping (not a crowding problem)
    if (!fails.length || round >= rounds || noGain >= 2) return best;

    const why = fails.map((c) => `${c.rule}: ${c.detail}`).join('; ');
    const named = new Set(fails.flatMap((c) => [...c.detail.matchAll(/[a-z_]+_\d+/g)].map((m) => m[0])));
    const victim =
      DROP_ORDER.map((test) => [...current.furniture].reverse().find(test)).find(Boolean) ??
      current.furniture.filter((f) => named.has(f.id) && !KEEP.has(f.type)).sort((a, b) => rank(a) - rank(b))[0];
    if (!victim) return best;

    dropped.push({ id: victim.id, name: victim.name, why: `room too full (${why})` });
    // also drop anything that sat on it (a lamp on a removed desk)
    current = { ...current, furniture: current.furniture.filter((f) => f.id !== victim.id && f.on !== victim.id) };
  }
}
