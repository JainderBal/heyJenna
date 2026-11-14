import { LayoutData, PlacedObject } from '../layout.types';
import { findFloorSpot, floorClashes, floorWarnings, footprintOf } from './floor';
import { insideRoom, overlaps } from './geometry';

// 6 x 4.8 room: door on the back wall near the left, window on the back wall to the right
const plan = {
  width: 6, depth: 4.8, wallHeight: 2.7, floor: 'wood', walls: {}, features: [],
  windows: [{ id: 'w', wall: 'back' as const, position: 4, width: 1.6, sill: 0.8, head: 2.4, view: 'plain' as const }],
  doors: [{ id: 'd', wall: 'back' as const, position: 1.2, width: 0.9, swing: 'in' as const }],
};
const obj = (id: string, x: number, y: number, size: { w: number; d: number; h: number }, extra: Partial<PlacedObject> = {}): PlacedObject => ({
  id, type: id.replace(/_\d+$/, ''), name: id, layer: 'furniture', zone: 'conversation', mount: 'floor',
  position: { x, y, z: 0 }, rotation_deg: 0, size, ...extra,
});
const data = (objects: PlacedObject[] = []): LayoutData => ({ objects, checks: [], summary: { pass: 0, warn: 0, fail: 0 }, zones: {}, focal_point: {}, dropped: [], edits: 0 });

// a sofa on the front wall facing the back wall, a coffee table in front of it, a rug under both
const living = () => data([
  obj('sofa_1', 3, 4.3, { w: 2, d: 0.9, h: 0.8 }, { rotation_deg: 180 }),
  obj('coffee_table_1', 3, 3.2, { w: 1.1, d: 0.6, h: 0.45 }),
  obj('rug_1', 3, 3.5, { w: 2.4, d: 1.7, h: 0.01 }, { layer: 'soft_furnishings' }),
]);
const sideTable = { type: 'side_table', size: { w: 0.45, d: 0.45, h: 0.55 } };
const plant = { type: 'plant', size: { w: 0.4, d: 0.4, h: 1.4 } };
const lamp = { type: 'floor_lamp', size: { w: 0.35, d: 0.35, h: 1.6 } };

describe('floor pieces', () => {
  describe('floorClashes', () => {
    it('refuses spots outside the room', () => {
      expect(floorClashes(plan, data(), sideTable, { x: 0.1, y: 2, rotationDeg: 0 })).toEqual(['sticks out of the room']);
    });
    it("keeps 90 cm clear in front of a door", () => {
      expect(floorClashes(plan, data(), sideTable, { x: 1.2, y: 0.6, rotationDeg: 0 })).toEqual(['blocks door d (keep 90 cm clear in front)']);
      expect(floorClashes(plan, data(), sideTable, { x: 1.2, y: 1.2, rotationDeg: 0 })).toEqual([]);
    });
    it('keeps tall pieces out of the window band, but low ones may sit under the sill', () => {
      expect(floorClashes(plan, data(), plant, { x: 4, y: 0.3, rotationDeg: 0 })[0]).toMatch(/too tall to stand in front of window w/);
      expect(floorClashes(plan, data(), sideTable, { x: 4, y: 0.3, rotationDeg: 0 })).toEqual([]);
    });
    it('refuses built-ins, lets rugs lie anywhere in the room', () => {
      const seat = obj('window_seat', 4, 0.25, { w: 1.6, d: 0.5, h: 0.45 }, { layer: 'features', type: 'window_seat' });
      expect(floorClashes(plan, data([seat]), sideTable, { x: 4, y: 0.3, rotationDeg: 0 })).toEqual(['overlaps window_seat']);
      expect(floorClashes(plan, data(), { type: 'rug', size: { w: 1.6, d: 1, h: 0.01 } }, { x: 1.2, y: 0.6, rotationDeg: 0 })).toEqual([]);
    });
  });

  describe('floorWarnings', () => {
    it('warns about overlapping furniture but not the rug', () => {
      expect(floorWarnings(living(), sideTable, { x: 3, y: 3.0, rotationDeg: 0 }, 'side_table_1')).toEqual(['side_table_1 overlaps coffee_table_1']);
    });
    it('warns when a piece stands where you sit down', () => {
      expect(floorWarnings(living(), sideTable, { x: 2.2, y: 3.6, rotationDeg: 0 }, 'side_table_1')).toEqual(['side_table_1 stands in front of sofa_1, in the way of using it']);
    });
  });

  describe('findFloorSpot', () => {
    const valid = (d: LayoutData, piece: typeof sideTable, spot: { x: number; y: number; rotationDeg: number }) => {
      expect(floorClashes(plan, d, piece, spot)).toEqual([]);
      expect(floorWarnings(d, piece, spot)).toEqual([]);
    };
    it('puts a side table right beside the sofa', () => {
      const spot = findFloorSpot(plan, living(), sideTable)!;
      expect(spot.near).toBe('sofa_1');
      valid(living(), sideTable, spot);
      expect(Math.abs(Math.abs(spot.x - 3) - 1.28)).toBeLessThan(0.1); // just past an arm
      expect(Math.abs(spot.y - 4.3)).toBeLessThan(0.25);
    });
    it('puts a floor lamp by a seat, and the side table and lamp on opposite arms', () => {
      const d = living();
      const t = findFloorSpot(plan, d, sideTable)!;
      d.objects.push(obj('side_table_1', t.x, t.y, sideTable.size, { rotation_deg: t.rotationDeg }));
      const l = findFloorSpot(plan, d, lamp)!;
      expect(l.near).toBe('sofa_1');
      valid(d, lamp, l);
      expect(Math.sign(l.x - 3)).toBe(-Math.sign(t.x - 3));
    });
    it('puts a plant into a free corner, clear of the door and window', () => {
      const spot = findFloorSpot(plan, living(), plant)!;
      valid(living(), plant, spot);
      const corner = Math.min(...[[0, 0], [6, 0], [0, 4.8], [6, 4.8]].map(([x, y]) => Math.hypot(spot.x - x, spot.y - y)));
      expect(corner).toBeLessThan(0.35);
    });
    it('turns an armchair to face the coffee table', () => {
      const chair = { type: 'armchair', size: { w: 0.8, d: 0.85, h: 0.9 } };
      const spot = findFloorSpot(plan, living(), chair)!;
      valid(living(), chair, spot);
      expect(spot.near).toBe('coffee_table_1');
      const f = footprintOf(obj('armchair_1', spot.x, spot.y, chair.size, { rotation_deg: spot.rotationDeg }));
      expect(overlaps(f, footprintOf(living().objects[1]))).toBe(false);
      // facing the table: rotation 0 faces +y, 90 faces +x
      const r = (spot.rotationDeg * Math.PI) / 180;
      expect(Math.sin(r) * (3 - spot.x) + Math.cos(r) * (3.2 - spot.y)).toBeGreaterThan(0);
    });
    it('backs a sideboard onto a wall', () => {
      const board = { type: 'sideboard', size: { w: 1.6, d: 0.45, h: 0.75 } };
      const spot = findFloorSpot(plan, living(), board)!;
      valid(living(), board, spot);
      const f = footprintOf(obj('sideboard_1', spot.x, spot.y, board.size, { rotation_deg: spot.rotationDeg }));
      expect(insideRoom(f, 6, 4.8)).toBe(true);
      expect(Math.min(spot.x, spot.y, 6 - spot.x, 4.8 - spot.y)).toBeLessThan(0.3);
    });
    it('gives up when nothing fits', () => {
      expect(findFloorSpot(plan, living(), { type: 'sideboard', size: { w: 7, d: 0.5, h: 0.8 } })).toBeNull();
    });
  });
});
