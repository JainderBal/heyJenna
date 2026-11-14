import { DIAL_DEFAULTS, FloorPlan, StyleDialValues, StyleProfile } from '@hey-jenna/contracts';
import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { cpus, tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { shoppingList } from '../../sourcing/matching/shopping-list';
import { ENGINE_SCRIPT } from './python-layout.engine';
import { EngineSpec } from './layout-engine';
import { buildEngineSpec } from './spec-builder';
import before from './fixtures/layout-before-dials.json';

/**
 * Layout and props dials, run through the real Python engine (no repair loop, so each case is one engine call).
 * Each dial: a low and a high value move the output the expected way. Defaults: the room is exactly what the
 * engine produced before the dials were wired (fixtures/layout-before-dials.json, recorded from the engine on main).
 */
jest.setTimeout(300_000);
const run = promisify(execFile);

type Obj = {
  id: string; type: string; position: { x: number; y: number }; rotation_deg: number; size: { w: number; d: number; h: number };
  colour?: string; colour_role?: string; shape?: string; style?: string; pattern?: string; motif?: string; pair?: string; arrangement?: string; content?: { content: string };
};
type Out = {
  objects: Obj[]; checks: { rule: string; status: string }[]; focal_point: { kind: string; position: number };
  variant: Record<string, unknown>; taste: { statement_piece?: string | null };
} & Record<string, unknown>;

const plan: FloorPlan = {
  width: 5.2, depth: 4.4, wallHeight: 2.6, floor: 'wood', walls: {}, features: [],
  windows: [{ id: 'w1', wall: 'back', position: 2.6, width: 1.6, sill: 0.8, head: 2.1, view: 'garden' }],
  doors: [{ id: 'd1', wall: 'left', position: 0.8, width: 0.9, swing: 'in' }],
};
const big: FloorPlan = { ...plan, width: 6.0, depth: 5.4, windows: [{ ...plan.windows[0], position: 3.0 }] };
const side: FloorPlan = { ...plan, windows: [{ ...plan.windows[0], wall: 'left' }] };
const two: FloorPlan = {
  ...plan, width: 5.8, depth: 4.2,
  windows: [{ ...plan.windows[0], position: 1.6, width: 1.2 }, { id: 'w2', wall: 'right', position: 2.2, width: 1.0, sill: 0.9, head: 2.1, view: 'street' }],
};
const NEEDS = ['has a cat', 'works from home', 'reads in the evening'];

function specFor(dials: Partial<StyleDialValues>, room: FloorPlan, needs: string[]): EngineSpec {
  const style: StyleProfile = {
    name: 'dials', source: 'test', keywords: [], vibe: [], shapeFamily: 'modern', materials: {},
    palette: { dominant: ['#F1E7DA', '#CBC3B7'], secondary: ['#8A7B6A', '#2F6E3E'], accent: ['#C8643C', '#2E4FC4', '#E9A23B'] },
    warmth: 0.5, saturation: 0.4, lightness: 0.7,
    dials: { ...DIAL_DEFAULTS, ...dials },
  };
  const chosen = shoppingList(room, needs).map((slot) => ({ slot, listings: [] }));
  return buildEngineSpec('test', room, needs, style, chosen).spec;
}

async function engine(spec: EngineSpec): Promise<Out> {
  const dir = await mkdtemp(join(tmpdir(), 'hj-dials-'));
  try {
    await writeFile(join(dir, 'in.json'), JSON.stringify(spec));
    await run('python3', [ENGINE_SCRIPT, join(dir, 'in.json'), '-o', join(dir, 'out.json')], { maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(await readFile(join(dir, 'out.json'), 'utf8')) as Out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Every case the tests read, run up front a few at a time (one engine call takes several seconds). */
type CaseArgs = [Partial<StyleDialValues>, FloorPlan, string[]];
const CASES = {
  base_plan: [{}, plan, NEEDS],
  base_two: [{}, two, []],
  base_big: [{}, big, NEEDS],
  base_side: [{}, side, NEEDS],
  float_lo: [{ furniture_float: 0 }, big, NEEDS],
  float_hi: [{ furniture_float: 1 }, big, NEEDS],
  sym_lo: [{ symmetry: 0 }, plan, NEEDS],
  sym_hi: [{ symmetry: 1 }, plan, NEEDS],
  sym_two: [{ symmetry: 1 }, two, NEEDS],
  base_two_needs: [{}, two, NEEDS],
  focal_art: [{ focal_point: 'art' }, side, NEEDS],
  rug_round: [{ rug_shape: 'round' }, plan, NEEDS],
  win_none: [{ window_treatment: 'none' }, two, []],
  win_blind: [{ window_treatment: 'roman_blind' }, two, []],
  win_sheer: [{ window_treatment: 'sheer' }, two, []],
  win_heavy: [{ window_treatment: 'heavy_drape' }, two, []],
  art_lo: [{ art_amount: 0 }, plan, NEEDS],
  art_hi: [{ art_amount: 1 }, plan, NEEDS],
  eclectic_hi: [{ art_amount: 1, eclecticism: 1 }, plan, NEEDS],
  textile_lo: [{ textile_layers: 0 }, plan, NEEDS],
  textile_hi: [{ textile_layers: 1 }, plan, NEEDS],
  order_lo: [{ styling_order: 0 }, plan, NEEDS],
  order_hi: [{ styling_order: 1 }, plan, NEEDS],
  rep_lo: [{ textile_layers: 1, repetition: 0 }, plan, NEEDS],
  rep_hi: [{ textile_layers: 1, repetition: 1 }, plan, NEEDS],
  pattern_hi: [{ pattern_amount: 1, pattern_scale: 1, pattern_motif: ['stripe', 'floral_botanical'] }, plan, NEEDS],
  pattern_small: [{ pattern_amount: 1, pattern_scale: 0 }, plan, NEEDS],
  pattern_some: [{ pattern_amount: 0.65 }, plan, NEEDS],
  statement_lo: [{ statement_strength: 0 }, plan, NEEDS],
  statement_hi: [{ statement_strength: 1 }, plan, NEEDS],
} satisfies Record<string, CaseArgs>;
type Case = keyof typeof CASES;
const out = {} as Record<Case, Out>;

beforeAll(async () => {
  const queue = Object.keys(CASES) as Case[];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) out[c] = await engine(specFor(...(CASES[c] as CaseArgs)));
  };
  await Promise.all(Array.from({ length: Math.max(2, Math.min(8, cpus().length - 1)) }, worker));
});

const of = (o: Out, type: string) => o.objects.filter((x) => x.type === type);
const sofa = (o: Out) => of(o, 'sofa')[0];
const fails = (o: Out) => o.checks.filter((c) => c.status === 'fail').map((c) => c.rule);
const cushions = (o: Out) => of(o, 'cushion').filter((c) => c.id.startsWith('cushion_'));
const tilt = (o: Out) => Math.max(...cushions(o).map((c) => Math.abs(((c.rotation_deg - sofa(o).rotation_deg + 540) % 360) - 180)));
/** the dial must not break a rule the default layout keeps */
const noNewFails = (o: Out, base: Out) => expect(fails(o).filter((f) => !fails(base).includes(f))).toEqual([]);

/** Drops the colours that now come from the moodboard (curtain colour, art colour lists), keeping everything else. */
function moodboardColoursOff(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v), function (key, val) {
    if (key === 'colours') return undefined;
    if (key === 'colour' && (this as { type?: string }).type === 'curtain') return undefined;
    if (key === 'curtain' && typeof val === 'string') return undefined;
    return val;
  });
}

describe('layout and props dials', () => {
  it('defaults reproduce the layout from before the dials were wired', () => {
    for (const [name, key] of [['plan_a', 'base_plan'], ['two_b', 'base_two']] as const) {
      const was = (before as Record<string, Record<string, unknown>>)[name];
      // since the fixture was recorded, curtains and wall art take the moodboard's colours (spec-builder): placement is unchanged
      for (const k of Object.keys(was)) expect([name, k, moodboardColoursOff(out[key][k])]).toEqual([name, k, moodboardColoursOff(was[k])]);
    }
  });

  it('furniture_float: 0 keeps the sofa on the wall, 1 floats it off the wall in a big room', () => {
    const wallGap = (o: Out) => { const p = sofa(o).position; return Math.min(p.x, big.width - p.x, p.y, big.depth - p.y); };
    expect(out.float_lo.variant.mount).toBe('wall');
    expect(out.float_hi.variant.mount).toBe('float');
    expect(wallGap(out.float_hi)).toBeGreaterThan(wallGap(out.float_lo) + 0.5);
    noNewFails(out.float_hi, out.base_big);
    noNewFails(out.float_lo, out.base_big);
  });

  it('symmetry: 1 centres the sofa on the focal point and pairs pieces, 0 sets it off-centre', () => {
    const offCentre = (o: Out) => Math.abs(sofa(o).position.x - o.focal_point.position);
    expect(out.sym_hi.variant.symmetry).toBe('symmetric');
    expect(out.sym_lo.variant.lateral).toBe(1);
    expect(offCentre(out.sym_hi)).toBeLessThan(offCentre(out.sym_lo));
    expect(offCentre(out.sym_hi)).toBeLessThanOrEqual(offCentre(out.base_plan));
    expect(out.base_two_needs.objects.some((o) => o.pair)).toBe(false);
    expect(of(out.sym_two, 'floor_lamp').filter((o) => o.pair)).toHaveLength(2); // a twin lamp at the other sofa end
    noNewFails(out.sym_hi, out.base_plan);
    noNewFails(out.sym_two, out.base_two_needs);
    noNewFails(out.sym_lo, out.base_plan);
  });

  it('focal_point: a named focal kind wins when the room has one', () => {
    expect(out.base_side.focal_point.kind).toBe('view');
    expect(out.focal_art.focal_point.kind).toBe('gallery');
  });

  it('rug_shape: round gives a round rug (rect is the default)', () => {
    expect(of(out.base_plan, 'rug')[0].shape).not.toBe('round');
    expect(of(out.rug_round, 'rug')[0].shape).toBe('round');
    noNewFails(out.rug_round, out.base_plan);
  });

  it('window_treatment: none, blinds, sheer and heavy drapes change the curtains', () => {
    const curtains = (o: Out) => of(o, 'curtain');
    expect(curtains(out.base_two)).toHaveLength(4); // two windows, a pair of linen panels each
    expect(curtains(out.win_none)).toHaveLength(0);
    expect(curtains(out.win_blind).map((c) => c.style)).toEqual(['roman_blind', 'roman_blind']);
    const width = (o: Out) => curtains(o)[0].size.w;
    expect(width(out.win_sheer)).toBeLessThan(width(out.base_two));
    expect(width(out.win_heavy)).toBeGreaterThan(width(out.base_two));
    expect(curtains(out.win_heavy).every((c) => c.style === 'heavy_drape')).toBe(true);
    for (const k of ['win_none', 'win_blind', 'win_sheer', 'win_heavy'] as const) noNewFails(out[k], out.base_two);
  });

  it('art_amount: 0 leaves only the focal art, 1 covers more wall (bigger pieces, galleries, extras where walls are free)', () => {
    const art = (o: Out) => of(o, 'art');
    const cover = (o: Out) => art(o).reduce((s, a) => s + a.size.w, 0);
    expect(art(out.art_lo).length).toBeLessThan(art(out.base_plan).length);
    expect(cover(out.art_hi)).toBeGreaterThan(cover(out.base_plan) + 0.2);
    expect(art(out.art_hi).filter((a) => a.arrangement === 'gallery').length).toBeGreaterThan(art(out.base_plan).filter((a) => a.arrangement === 'gallery').length);
    noNewFails(out.art_hi, out.base_plan);
  });

  it('eclecticism: 1 gives every wall piece a different subject, the default keeps one subject', () => {
    const subjects = (o: Out) => new Set(of(o, 'art').map((a) => a.content?.content)).size;
    expect(subjects(out.art_hi)).toBe(1);
    expect(subjects(out.eclectic_hi)).toBe(of(out.eclectic_hi, 'art').length);
    expect(subjects(out.eclectic_hi)).toBeGreaterThan(1);
  });

  it('textile_layers: 0 strips cushions and throw, 1 adds more cushions', () => {
    expect(cushions(out.textile_lo)).toHaveLength(0);
    expect(of(out.textile_lo, 'throw')).toHaveLength(0);
    expect(cushions(out.textile_hi).length).toBeGreaterThan(cushions(out.base_plan).length);
    expect(of(out.textile_hi, 'throw')).toHaveLength(1);
  });

  it('styling_order: 1 sets cushions upright, 0 tosses them more than the default', () => {
    expect(tilt(out.order_hi)).toBe(0);
    expect(tilt(out.order_lo)).toBeGreaterThan(tilt(out.base_plan));
  });

  it('repetition: 1 repeats cushion colours in pairs, 0 makes every cushion different', () => {
    const cols = (o: Out) => cushions(o).map((c) => c.colour);
    expect(cols(out.rep_hi)[0]).toBe(cols(out.rep_hi)[1]);
    expect(new Set(cols(out.rep_hi)).size).toBeLessThan(cols(out.rep_hi).length);
    expect(new Set(cols(out.rep_lo)).size).toBe(cols(out.rep_lo).length);
  });

  it('pattern_amount, pattern_scale and pattern_motif mark the patterned textiles', () => {
    const patterned = (o: Out) => o.objects.filter((x) => x.pattern);
    const textiles = (o: Out) => o.objects.filter((x) => ['rug', 'curtain', 'throw', 'cushion'].includes(x.type) && !x.id.startsWith('seat_')); // window-seat pads come later
    expect(patterned(out.base_plan)).toHaveLength(0); // default .3: solids, as before
    expect(patterned(out.pattern_some).length).toBeGreaterThan(0);
    expect(patterned(out.pattern_some).length).toBeLessThan(textiles(out.pattern_some).length);
    expect(patterned(out.pattern_hi)).toHaveLength(textiles(out.pattern_hi).length);
    expect(patterned(out.pattern_hi).map((o) => o.pattern).slice(0, 3)).toEqual(['large', 'medium', 'small']); // one large, one medium, the rest small
    expect(patterned(out.pattern_small).every((o) => o.pattern === 'small')).toBe(true);
    expect(new Set(patterned(out.pattern_hi).map((o) => o.motif))).toEqual(new Set(['stripe', 'floral_botanical']));
    expect(patterned(out.pattern_small).some((o) => o.motif)).toBe(false); // default motif "none": no motif named
  });

  it('statement_strength: 1 dresses the hero sofa in the accent, 0 has no statement piece', () => {
    expect(sofa(out.statement_hi).colour_role).toBe('accent');
    expect(sofa(out.base_plan).colour_role).not.toBe('accent');
    expect(out.statement_lo.taste.statement_piece ?? null).toBeNull();
    expect(out.base_plan.taste.statement_piece).toBeTruthy();
    noNewFails(out.statement_hi, out.base_plan);
  });
});
