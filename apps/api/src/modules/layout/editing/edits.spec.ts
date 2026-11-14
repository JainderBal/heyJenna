import { LayoutData, PlacedObject } from '../layout.types';
import { EditError, moveObject, removeObject } from './edits';

const obj = (id: string, x: number, y: number, extra: Partial<PlacedObject> = {}): PlacedObject => ({
  id, type: id.replace(/_\d+$/, ''), name: id, layer: 'furniture', zone: 'conversation', mount: 'floor',
  position: { x, y, z: 0 }, rotation_deg: 0, size: { w: 1, d: 0.6, h: 0.8 }, ...extra,
});
const plan = { width: 5, depth: 4, wallHeight: 2.6, floor: 'wood', walls: {}, windows: [], doors: [], features: [] };
const layout = (): LayoutData => ({
  objects: [
    obj('desk_1', 1, 0.5),
    obj('table_lamp_1', 1.2, 0.5, { mount: 'surface', layer: 'lighting', on: 'desk_1', size: { w: 0.2, d: 0.2, h: 0.4 } }),
    obj('sofa_1', 3, 2, { size: { w: 2, d: 0.9, h: 0.8 } }),
    obj('wall_back', 2.5, 0, { layer: 'architecture' }),
  ],
  checks: [], summary: { pass: 0, warn: 0, fail: 0 }, zones: {}, focal_point: {}, dropped: [], edits: 0,
});

describe('layout edits', () => {
  it('moves a desk and its lamp together', () => {
    const d = layout();
    expect(moveObject(d, plan, 'desk_1', { x: 1.5 })).toEqual([]);
    expect(d.objects.find((o) => o.id === 'table_lamp_1')!.position.x).toBeCloseTo(1.7);
  });
  it('warns on overlap but still moves', () => {
    const d = layout();
    expect(moveObject(d, plan, 'desk_1', { x: 2.5, y: 2 })).toEqual(['desk_1 overlaps sofa_1']);
  });
  it('refuses moves outside the room and walls', () => {
    expect(() => moveObject(layout(), plan, 'sofa_1', { x: 4.5 })).toThrow(EditError);
    expect(() => moveObject(layout(), plan, 'wall_back', { x: 1 })).toThrow(EditError);
  });
  it('removes a piece with what stands on it', () => {
    const d = layout();
    expect(removeObject(d, 'desk_1')).toEqual(['desk_1', 'table_lamp_1']);
    expect(d.objects.map((o) => o.id)).toEqual(['sofa_1', 'wall_back']);
  });
});
