import { DIAL_DEFAULTS, StyleProfile } from '@hey-jenna/contracts';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { shoppingList } from '../../sourcing/matching/shopping-list';
import { ENGINE_SCRIPT } from './python-layout.engine';
import { EngineSpec } from './layout-engine';
import { solveWithRepairs } from './repair';
import { buildEngineSpec } from './spec-builder';
import { engineStyleFromDials, woodColours } from './style-dials';

const plan = {
  width: 5.2, depth: 4.4, wallHeight: 2.6, floor: 'wood', walls: {}, features: [],
  windows: [{ id: 'w1', wall: 'back' as const, position: 2.6, width: 1.6, sill: 0.8, head: 2.1, view: 'garden' as const }],
  doors: [{ id: 'd1', wall: 'left' as const, position: 0.8, width: 0.9, swing: 'in' as const }],
};

describe('buildEngineSpec + Python engine', () => {
  it('places a full room from placeholders only (no products picked yet)', async () => {
    const needs = ['has a cat', 'works from home', 'reads in the evening'];
    const chosen = shoppingList(plan, needs).map((slot) => ({ slot, listings: [] }));
    const { spec } = buildEngineSpec('test', plan, needs, null, chosen);
    expect(spec.furniture.every((f) => f.suggested)).toBe(true);

    const { result: out } = await solveWithRepairs({ run: async (s) => runPython(s) }, spec);
    expect(out.summary.fail).toBe(0);
    const ids = out.objects.map((o: { id: string }) => o.id);
    expect(ids).toEqual(expect.arrayContaining(['sofa_1', 'desk_1', 'cat_tree_1']));
  });

  it('drops a blocked optional piece and re-runs when the room is over-full', async () => {
    const needs = ['has a cat', 'works from home', 'reads in the evening', 'has friends over'];
    const chosen = shoppingList(plan, needs).map((slot) => ({ slot: slot.type === 'armchair' ? { ...slot, count: 3 } : slot, listings: [] }));
    const { spec } = buildEngineSpec('test', plan, needs, null, chosen);
    const { result, dropped } = await solveWithRepairs({ run: async (s) => runPython(s) }, spec);
    expect(result.summary.fail).toBe(0);
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped.every((d) => d.id !== 'sofa_1')).toBe(true);
  });

  it('style dials reach the engine: density, plants, art, light, features, fillers', async () => {
    const needs = ['has a cat', 'works from home', 'reads in the evening'];
    const style: StyleProfile = {
      name: 'calm', source: 'test', keywords: ['oak'], vibe: [], shapeFamily: 'modern', materials: {},
      palette: { dominant: ['#F1E7DA', '#CBC3B7'], secondary: ['#8A7B6A'], accent: ['#C8643C'] }, warmth: 0.2, saturation: 0.2, lightness: 0.8,
      dials: { ...DIAL_DEFAULTS, styling_density: 0.2, plant_amount: 0.25, art_arrangement: 'pair', light_warmth_k: 3000, negative_space: 0.9, architectural_detail: 0, wood_tone: 0 },
    };
    const chosen = shoppingList(plan, needs).map((slot) => ({ slot, listings: [] }));
    const { spec } = buildEngineSpec('test', plan, needs, style, chosen);
    const p = spec.style_profile as Record<string, any>;
    expect(p.styling_density).toBe('sparse');
    expect(p.plant_count).toBe(2);
    expect(p.art.arrangement).toBe('pair');
    expect(p.light_warmth_k).toBe(3000);
    expect(p.features.max).toBe(0);
    expect(p.fillers).not.toContain('pouf');
    expect(p.materials.wood).toBe('#E2C9A0');
    const { result: out } = await solveWithRepairs({ run: async (s) => runPython(s) }, spec);
    expect((out.checks as { status: string }[]).filter((c) => c.status === 'fail')).toEqual([]);
    expect((out.style_profile as { light_warmth_k: number }).light_warmth_k).toBe(3000);
    expect(out.objects.filter((o: { type: string }) => ['niche', 'platform', 'half_wall', 'built_in_shelf', 'ceiling_beam', 'window_seat'].includes(o.type))).toHaveLength(0);
  });

  it('maps feature and filler dials', () => {
    const p = engineStyleFromDials({ ...DIAL_DEFAULTS, zone_definition: 0.8, rawness: 0.7, wall_treatment: 'panelling', grouping: 0.2, architectural_detail: 1 }, plan, { wood: '#123456' });
    expect(p.profile.features).toEqual({ prefer: ['platform', 'half_wall', 'ceiling_beam', 'wainscoting'], max: 3 });
    expect(p.profile.fillers).not.toContain('plant_group');
    expect(p.wood).toEqual({}); // board's own wood wins
    expect(woodColours(1).wood).toBe('#4E3020');
  });
});

function runPython(spec: EngineSpec) {
  const dir = mkdtempSync(join(tmpdir(), 'hj-test-'));
  writeFileSync(join(dir, 'in.json'), JSON.stringify(spec));
  execFileSync('python3', [ENGINE_SCRIPT, join(dir, 'in.json'), '-o', join(dir, 'out.json')]);
  return JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8'));
}
