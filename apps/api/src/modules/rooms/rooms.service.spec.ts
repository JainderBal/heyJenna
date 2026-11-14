import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateRoomSchema } from './dto/create-room.dto';
import { RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';

const room = (extra: object = {}) => ({
  id: 'r1', ownerId: 'u1', name: 'Living', floorPlan: { width: 4, depth: 3.5 }, needs: [], projectId: null,
  createdAt: new Date(), updatedAt: new Date(), ...extra,
});

describe('RoomsService projects', () => {
  const repo = {
    create: jest.fn(async (_o: string, dto: { projectId?: string | null }) => room({ projectId: dto.projectId ?? null })),
    createMany: jest.fn(async () => [room({ projectId: 'p1' })]),
    projectOwned: jest.fn(async (projectId: string, ownerId: string) => projectId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' && ownerId === 'u1'),
  };
  const service = new RoomsService(repo as unknown as RoomsRepository);
  const dto = (extra: object = {}) => CreateRoomSchema.parse({ name: 'Living', floorPlan: { width: 4, depth: 3.5 }, ...extra });
  beforeEach(() => jest.clearAllMocks());

  it('still creates rooms without a project', async () => {
    expect((await service.create('u1', dto())).projectId).toBeNull();
    expect(repo.projectOwned).not.toHaveBeenCalled();
  });

  it('puts a room in a project the caller owns, and refuses anyone else’s', async () => {
    const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect((await service.create('u1', dto({ projectId }))).projectId).toBe(projectId);
    await expect(service.create('u2', dto({ projectId }))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bulk create checks every floor plan first and creates nothing if one is bad', async () => {
    const good = dto({ name: 'Bed' });
    const bad = dto({ name: 'Den', floorPlan: { width: 2, depth: 2, doors: [{ id: 'd1', wall: 'back', position: 1.8, width: 0.9 }] } });
    await expect(service.createMany('u1', 'p1', [good, bad])).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.createMany).not.toHaveBeenCalled();
    expect(await service.createMany('u1', 'p1', [good])).toHaveLength(1);
    expect(repo.createMany).toHaveBeenCalledWith('u1', 'p1', [good]);
  });
});
