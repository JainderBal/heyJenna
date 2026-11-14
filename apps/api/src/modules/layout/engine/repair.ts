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

/** Pieces the person asked for (or the room can't work without): leaving one out counts as a problem to fix. */
const NEEDED = new Set(['sofa', 'coffee_table', 'desk', 'desk_chair', 'cat_tree']);

/** Needed pieces the engine couldn't place ("placed desk_1: no wall with room…" warnings). */
function missingNeeded(result: EngineResult, spec: EngineSpec): { id: string; why: string }[] {
  const types = new Map(spec.furniture.map((f) => [f.id, f.type]));
  return result.checks
    .filter((c) => c.status !== 'pass' && c.rule.startsWith('placed '))
    .map((c) => ({ id: c.rule.slice('placed '.length), why: c.detail }))
    .filter((m) => NEEDED.has(types.get(m.id) ?? ''));
}

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
  let best: { result: EngineResult; dropped: Dropped[]; problems: number } | undefined;
  for (let round = 0; ; round++) {
    const result = await engine.run(current);
    const fails = result.checks.filter((c) => c.status === 'fail');
    const missing = missingNeeded(result, current);
    const problems = fails.length * 2 + missing.length; // a missing desk is bad; a broken rule is worse
    if (!best || problems < best.problems) best = { result, dropped: [...dropped], problems };
    if (!problems || round >= rounds) return finish(best, spec);

    const why = [...fails.map((c) => `${c.rule}: ${c.detail}`), ...missing.map((m) => `no room for ${m.id}: ${m.why}`)].join('; ');
    const named = new Set(fails.flatMap((c) => [...c.detail.matchAll(/[a-z_]+_\d+/g)].map((m) => m[0])));
    // a rule that names the piece in trouble ("blocked: armchair_1") points at the fix: drop that piece first;
    // only when nothing optional is named (e.g. no room for the desk) do the least important extras go
    const victim =
      current.furniture.filter((f) => named.has(f.id) && !KEEP.has(f.type)).sort((a, b) => rank(a) - rank(b))[0] ??
      DROP_ORDER.map((test) => [...current.furniture].reverse().find(test)).find(Boolean);
    if (!victim) return finish(best, spec);

    dropped.push({ id: victim.id, name: victim.name, why: `room too full (${why})` });
    // also drop anything that sat on it (a lamp on a removed desk)
    current = { ...current, furniture: current.furniture.filter((f) => f.id !== victim.id && f.on !== victim.id) };
  }
}

/** Needed pieces still missing at the end are reported as dropped too, never silently. */
function finish(best: { result: EngineResult; dropped: Dropped[] }, spec: EngineSpec) {
  const extra = missingNeeded(best.result, spec)
    .filter((m) => !best.dropped.some((d) => d.id === m.id))
    .map((m) => ({ id: m.id, name: spec.furniture.find((f) => f.id === m.id)?.name ?? m.id, why: `couldn't place it: ${m.why}` }));
  return { result: best.result, dropped: [...best.dropped, ...extra] };
}
