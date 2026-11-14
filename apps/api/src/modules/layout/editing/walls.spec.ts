import { LayoutData } from '../layout.types';
import { findWallSpot, wallClashes, wallPose } from './walls';

const plan = {
  width: 6, depth: 4.8, wallHeight: 2.7, floor: 'wood', walls: {}, features: [],
  windows: [{ id: 'w', wall: 'back' as const, position: 4, width: 1.6, sill: 0.8, head: 2.4, view: 'plain' as const }],
  doors: [{ id: 'd', wall: 'back' as const, position: 1.2, width: 0.9, swing: 'in' as const }],
};
const data = (objects: unknown[] = []): LayoutData => ({ objects, checks: [], summary: { pass: 0, warn: 0, fail: 0 }, zones: {}, focal_point: {}, dropped: [], edits: 0 }) as LayoutData;
const picture = { w: 0.6, d: 0.03, h: 0.8 };

describe('walls', () => {
  it('refuses a spot over a window or a door', () => {
    expect(wallClashes(plan, data(), 'back', 4, 1.45, picture)).toEqual(['overlaps window w']);
    expect(wallClashes(plan, data(), 'back', 1.2, 1.45, picture)).toEqual(['overlaps door d']);
    expect(wallClashes(plan, data(), 'back', 2.5, 1.45, picture)).toEqual([]);
  });
  it('refuses overlapping another picture, allows one above a low shelf line', () => {
    const art = { id: 'art_1', type: 'art', wall: 'left', mount: 'wall', layer: 'art', position: { x: 0.02, y: 2, z: 1.45 }, size: { w: 1, d: 0.03, h: 0.8 } };
    expect(wallClashes(plan, data([art]), 'left', 2.3, 1.45, picture)).toEqual(['overlaps art_1']);
    expect(wallClashes(plan, data([art]), 'left', 3.6, 1.45, picture)).toEqual([]);
  });
  it('puts a piece on the wall, facing into the room', () => {
    expect(wallPose(plan, 'left', 2, 0.03)).toEqual({ x: 0.02, y: 2, rotation: 90 });
    expect(wallPose(plan, 'back', 3, 0.2)).toEqual({ x: 3, y: 0.105, rotation: 0 });
  });
  it('finds a free spot, away from windows and doors and not behind a tall bookcase', () => {
    const bookcase = { id: 'shelf_1', type: 'shelf', mount: 'floor', layer: 'furniture', position: { x: 0.2, y: 1, z: 0 }, size: { w: 1.6, d: 0.4, h: 2 } };
    const spot = findWallSpot(plan, data([bookcase]), picture, ['back', 'left'])!;
    expect(spot).not.toBeNull();
    expect(wallClashes(plan, data([bookcase]), spot.wall, spot.u, spot.z, picture)).toEqual([]);
    if (spot.wall === 'left') expect(Math.abs(spot.u - 1)).toBeGreaterThan(1.1);
  });
});
