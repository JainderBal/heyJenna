import { EngineResult, EngineSpec } from './layout-engine';
import { solveWithRepairs } from './repair';

const item = (id: string, type: string) => ({ id, type, name: id, size: { w: 1, d: 1, h: 1 }, colour: 'auto' });
const spec: EngineSpec = { room: {}, needs: [], style_profile: {}, furniture: [item('sofa_1', 'sofa'), item('desk_1', 'desk'), item('sideboard_1', 'sideboard')] };

/** Fake engine: the desk only fits once the sideboard is gone. */
const engine = {
  run: async (s: EngineSpec): Promise<EngineResult> => {
    const crowded = s.furniture.some((f) => f.id === 'sideboard_1');
    return {
      objects: [], zones: {}, focal_point: {}, summary: { pass: 1, warn: crowded ? 1 : 0, fail: 0 },
      checks: crowded ? [{ rule: 'placed desk_1', status: 'warn', detail: 'no wall with room for a desk and a chair' }] : [],
    };
  },
};

describe('solveWithRepairs', () => {
  it('drops an extra to make room for a needed piece', async () => {
    const { result, dropped } = await solveWithRepairs(engine, spec);
    expect(result.checks).toEqual([]);
    expect(dropped.map((d) => d.id)).toEqual(['sideboard_1']);
  });
  it('reports a needed piece it could not fit', async () => {
    const stuck = { run: async () => ({ ...(await engine.run(spec)) }) };
    const { dropped } = await solveWithRepairs(stuck, spec);
    expect(dropped.find((d) => d.id === 'desk_1')?.why).toMatch(/couldn't place it/);
  });
});
