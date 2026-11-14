import { BulkRoomInput } from '@hey-jenna/contracts';
import { CreateRoomSchema } from './dto/create-room.dto';
import { UpdateRoomSchema } from './dto/update-room.dto';
import { toRoomResponse } from './mappers/room.mapper';
import { planColumns, RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';

const row = (extra: object = {}) =>
  ({
    id: 'r1', ownerId: 'u1', name: 'Living', floorPlan: { width: 4, depth: 3.5 }, needs: [], projectId: null,
    planX: null, planY: null, createdAt: new Date(), updatedAt: new Date(), ...extra,
  }) as never;

describe('room plan position', () => {
  it('validates planPosition on create, update and bulk create', () => {
    const plan = { width: 4, depth: 3.5 };
    expect(CreateRoomSchema.parse({ name: 'A', floorPlan: plan, planPosition: { x: 1.2, y: 3 } }).planPosition).toEqual({ x: 1.2, y: 3 });
    expect(UpdateRoomSchema.parse({ planPosition: null }).planPosition).toBeNull();
    expect(UpdateRoomSchema.parse({}).planPosition).toBeUndefined();
    expect(UpdateRoomSchema.safeParse({ planPosition: { x: 1 } }).success).toBe(false);
    expect(UpdateRoomSchema.safeParse({ planPosition: { x: 'a', y: 1 } }).success).toBe(false);
    expect(UpdateRoomSchema.safeParse({ planPosition: { x: 1e6, y: 1 } }).success).toBe(false);
    expect(UpdateRoomSchema.safeParse({ planPosition: { x: Infinity, y: 1 } }).success).toBe(false);
    expect(BulkRoomInput.parse({ name: 'A', floorPlan: plan, planPosition: { x: 0, y: 4 } }).planPosition).toEqual({ x: 0, y: 4 });
  });

  it('maps the columns to planPosition in responses (null when not placed)', () => {
    expect(toRoomResponse(row()).planPosition).toBeNull();
    expect(toRoomResponse(row({ planX: 4.2, planY: 0 })).planPosition).toEqual({ x: 4.2, y: 0 });
    expect(toRoomResponse(row({ planX: 4.2, planY: null })).planPosition).toBeNull();
  });

  it('turns planPosition into columns: undefined leaves them, null clears them', () => {
    expect(planColumns(undefined)).toEqual({});
    expect(planColumns(null)).toEqual({ planX: null, planY: null });
    expect(planColumns({ x: 1, y: 2 })).toEqual({ planX: 1, planY: 2 });
  });

  it('PATCH saves only the position and returns it', async () => {
    const update = jest.fn(async (_db: unknown) => row({ planX: 2.5, planY: 1 }));
    const db = { room: { update } };
    const repo = new RoomsRepository(db as never);
    const findOwned = jest.spyOn(repo, 'findOwned').mockResolvedValue(row());
    const service = new RoomsService(repo);
    const res = await service.update('r1', 'u1', UpdateRoomSchema.parse({ planPosition: { x: 2.5, y: 1 } }));
    expect(findOwned).toHaveBeenCalledWith('r1', 'u1');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { name: undefined, needs: undefined, projectId: undefined, floorPlan: undefined, planX: 2.5, planY: 1 },
    });
    expect(res.planPosition).toEqual({ x: 2.5, y: 1 });
  });

  it('PATCH without planPosition leaves the stored position alone', async () => {
    const update = jest.fn(async (_db: unknown) => row({ name: 'Den', planX: 3, planY: 3 }));
    const repo = new RoomsRepository({ room: { update } } as never);
    jest.spyOn(repo, 'findOwned').mockResolvedValue(row());
    const res = await new RoomsService(repo).update('r1', 'u1', UpdateRoomSchema.parse({ name: 'Den' }));
    const data = (update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect('planX' in data).toBe(false);
    expect(res.planPosition).toEqual({ x: 3, y: 3 });
  });

  it('bulk create stores each room’s position', async () => {
    const create = jest.fn(async (a: { data: object }) => row(a.data));
    const db = { room: { create }, $transaction: (ps: Promise<unknown>[]) => Promise.all(ps) };
    const repo = new RoomsRepository(db as never);
    const rooms = [
      CreateRoomSchema.parse({ name: 'A', floorPlan: { width: 4, depth: 3 }, planPosition: { x: 0, y: 0 } }),
      CreateRoomSchema.parse({ name: 'B', floorPlan: { width: 4, depth: 3 } }),
    ];
    const out = (await new RoomsService(repo).createMany('u1', 'p1', rooms)).map((r) => r.planPosition);
    expect(out).toEqual([{ x: 0, y: 0 }, null]);
  });
});
