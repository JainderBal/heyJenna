import { EngineResult, EngineSpec } from './layout-engine';
import { solveBestVariant } from './variants';

const result = (fail: number, warn: number): EngineResult =>
  ({ objects: [], zones: {}, focal_point: {}, checks: [], summary: { pass: 10, warn, fail } }) as EngineResult;

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
