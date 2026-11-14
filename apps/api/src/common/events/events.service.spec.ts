import { RoomEventsService } from './events.service';

describe('RoomEventsService', () => {
  it('delivers events only to listeners of that room, with the standard shape', () => {
    const bus = new RoomEventsService();
    const a: unknown[] = [], b: unknown[] = [];
    bus.subscribe('room-a', (e) => a.push(e));
    bus.subscribe('room-b', (e) => b.push(e));
    bus.publish('room-a', 'layout.generated', { layoutId: 'L1' });
    expect(b).toHaveLength(0);
    expect(a).toEqual([{ type: 'layout.generated', roomId: 'room-a', at: expect.any(String), data: { layoutId: 'L1' } }]);
    expect(Number.isNaN(Date.parse((a[0] as { at: string }).at))).toBe(false);
  });

  it('stops delivering after unsubscribe and forgets empty rooms', () => {
    const bus = new RoomEventsService();
    const got: unknown[] = [];
    const off = bus.subscribe('r', (e) => got.push(e));
    expect(bus.listenerCount('r')).toBe(1);
    off();
    bus.publish('r', 'render.done');
    expect(got).toHaveLength(0);
    expect(bus.listenerCount('r')).toBe(0);
  });

  it('keeps delivering when one listener throws', () => {
    const bus = new RoomEventsService();
    const got: unknown[] = [];
    bus.subscribe('r', () => { throw new Error('closed socket'); });
    bus.subscribe('r', (e) => got.push(e));
    bus.publish('r', 'render.queued');
    expect(got).toHaveLength(1);
  });
});
