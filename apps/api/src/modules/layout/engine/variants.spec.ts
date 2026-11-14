import { EngineResult, EngineSpec } from './layout-engine';
import { DIAL_DEFAULTS } from '@hey-jenna/contracts';
import { solveBestVariant, variantsFor } from './variants';

const result = (fail: number, warn: number, objects: unknown[] = []): EngineResult =>
  ({ objects, zones: {}, focal_point: {}, checks: [], summary: { pass: 10, warn, fail } }) as EngineResult;
const at = (id: string, type: string, x: number, y: number) => ({ id, type, layer: 'furniture', position: { x, y, z: 0 } });

describe('solveBestVariant', () => {
  it('keeps the variant with the fewest broken rules, skipping ones that cannot fit', async () => {
    const engine = {
      run: async (s: EngineSpec) => {
        const v = s.variant as Record<string, unknown>;
        if (v.mount === 'wall') throw new Error('could not fit the conversation group for this variant');
        return v.orient === 'frames' && !v.lounge ? result(0, 2) : result(1, 0);
      },
    };
    const best = await solveBestVariant(engine, { room: {}, needs: [], style_profile: {}, furniture: [] });
    expect(best.variant).toEqual({ orient: 'frames' });
    expect(best.tried).toBe(5);
  });
});

describe('seating group', () => {
  it('prefers a tight conversation group over a scattered one with the same rule results', async () => {
    const tight = [at('t', 'coffee_table', 2, 2), at('s', 'sofa', 2, 3), at('a', 'armchair', 3.2, 2)];
    const loose = [at('t', 'coffee_table', 2, 2), at('s', 'sofa', 2, 3), at('a', 'armchair', 5, 4)];
    const engine = { run: async (s: EngineSpec) => result(0, 1, (s.variant as Record<string, unknown>).lateral ? tight : loose) };
    const best = await solveBestVariant(engine, { room: {}, needs: [], style_profile: {}, furniture: [] });
    expect(best.variant).toEqual({ lateral: 1 });
  });
});

describe('variants and the layout dials', () => {
  it('tries every variant at the default dials', () => {
    expect(variantsFor(DIAL_DEFAULTS)).toHaveLength(6);
    expect(variantsFor(undefined)).toHaveLength(6);
  });

  it('skips variants that would undo a dial the user set', async () => {
    const tried: Record<string, unknown>[] = [];
    const engine = { run: async (s: EngineSpec) => (tried.push(s.variant as Record<string, unknown>), result(0, 0)) };
    const style_profile = { dials: { ...DIAL_DEFAULTS, furniture_float: 1, symmetry: 1 } };
    await solveBestVariant(engine, { room: {}, needs: [], style_profile, furniture: [] });
    expect(tried.some((v) => 'mount' in v || 'lateral' in v)).toBe(false);
    expect(tried).toHaveLength(4);
  });
});
