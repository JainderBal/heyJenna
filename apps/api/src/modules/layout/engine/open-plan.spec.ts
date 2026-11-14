import { FloorPlan } from '@hey-jenna/contracts';
import { EngineResult } from './layout-engine';
import { asIfClosed, takeDownOpenWallPieces } from './open-plan';

const plan = FloorPlan.parse({ width: 3.66, depth: 2.9, walls: { back: { open: true }, left: { colour: '#ffffff' } } });
const obj = (id: string, type: string, mount: string, zone: string, wall?: string) =>
  ({ id, type, name: id, layer: 'decor', zone, mount, position: { x: 0, y: 0, z: 0 }, rotation_deg: 0, size: { w: 1, d: 0.1, h: 1 }, ...(wall ? { wall } : {}) });

describe('open-plan fallback', () => {
  it('closes the open sides and keeps the other finishes', () => {
    expect(asIfClosed(plan).walls).toEqual({ back: { finish: 'paint', open: undefined }, left: { finish: 'paint', colour: '#ffffff', open: undefined } });
  });

  it('takes down pieces hung on an open side and hides that wall in renders', () => {
    const result = {
      objects: [
        obj('wall_back', 'wall', 'floor', 'back'),
        obj('wall_left', 'wall', 'floor', 'left'),
        obj('art_1', 'art', 'wall', 'conversation', 'back'),
        obj('feature_wall', 'feature_wall', 'wall', 'back', 'back'),
        obj('art_2', 'art', 'wall', 'left', 'left'),
        obj('sofa_1', 'sofa', 'floor', 'conversation'),
      ],
    } as unknown as EngineResult;
    const { result: out, removed } = takeDownOpenWallPieces(result, plan);
    expect(removed).toEqual(['art_1', 'feature_wall']);
    expect(out.objects.map((o) => o.id)).toEqual(['wall_back', 'wall_left', 'art_2', 'sofa_1']);
    expect(out.objects[0]).toMatchObject({ render: false });
    expect(out.objects[1]).not.toHaveProperty('render');
  });
});
