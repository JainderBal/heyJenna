import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '../api/types';
import { PLANS, forgetLegacySpots, legacySpotsToMove, placeRooms, sampleRooms, snapPlan } from './plans';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

const room = (id: string, planPosition: Room['planPosition'] = null, w = 4, d = 3): Room =>
  ({ id, name: id, needs: [], projectId: 'p', planPosition, areaM2: w * d, createdAt: '', updatedAt: '', floorPlan: { width: w, depth: d } }) as unknown as Room;

describe('plan positions', () => {
  it('the API position wins over an old localStorage one; loose rooms are packed below', () => {
    store.set('hj-plan-pos:p', JSON.stringify({ a: { x: 9, z: 9 }, b: { x: 1, z: 2 } }));
    const R = placeRooms('p', [room('a', { x: 4.2, y: 0 }), room('b'), room('c')]);
    expect(R.map((r) => [r.room.id, r.x, r.z])).toEqual([
      ['a', 4.2, 0],
      ['b', 1, 2],
      ['c', 0, 5], // packed under the lowest placed room (b ends at z = 2 + 3)
    ]);
  });

  it('works without localStorage (private mode)', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); } });
    expect(placeRooms('p', [room('a', { x: 1, y: 1 }), room('b')]).map((r) => [r.x, r.z])).toEqual([[1, 1], [0, 4]]);
    expect(legacySpotsToMove('p', [room('a')])).toEqual([]);
  });

  it('finds the old spots to move to the API: only rooms the API has no position for', () => {
    store.set('hj-plan-pos:p', JSON.stringify({ a: { x: 9, z: 9 }, b: { x: 1, z: 2 }, gone: { x: 0, z: 0 }, bad: { x: 'x', z: 1 } }));
    expect(legacySpotsToMove('p', [room('a', { x: 4, y: 0 }), room('b'), room('bad'), room('c')])).toEqual([{ roomId: 'b', pos: { x: 1, y: 2 } }]);
  });

  it('forgets moved spots, and the whole key once empty', () => {
    store.set('hj-plan-pos:p', JSON.stringify({ a: { x: 1, z: 1 }, b: { x: 2, z: 2 } }));
    forgetLegacySpots('p', ['a']);
    expect(JSON.parse(store.get('hj-plan-pos:p')!)).toEqual({ b: { x: 2, z: 2 } });
    forgetLegacySpots('p', ['b']);
    expect(store.has('hj-plan-pos:p')).toBe(false);
  });

  it('the sample plan creates rooms with their positions', () => {
    const body = sampleRooms(PLANS.flat);
    expect(body[1]).toMatchObject({ name: 'Kitchen', planPosition: { x: 4.2, y: 0 } });
    expect(body[2].planPosition).toEqual({ x: 0, y: 3.6 });
  });

  it('snaps dragged positions to 5 cm', () => {
    expect(snapPlan(1.234)).toBe(1.25);
    expect(snapPlan(-0.02)).toBe(-0);
  });
});
