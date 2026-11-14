import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { shoppingList } from '../../sourcing/matching/shopping-list';
import { ENGINE_SCRIPT } from './python-layout.engine';
import { EngineSpec } from './layout-engine';
import { solveWithRepairs } from './repair';
import { buildEngineSpec } from './spec-builder';

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
});

function runPython(spec: EngineSpec) {
  const dir = mkdtempSync(join(tmpdir(), 'hj-test-'));
  writeFileSync(join(dir, 'in.json'), JSON.stringify(spec));
  execFileSync('python3', [ENGINE_SCRIPT, join(dir, 'in.json'), '-o', join(dir, 'out.json')]);
  return JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8'));
}
