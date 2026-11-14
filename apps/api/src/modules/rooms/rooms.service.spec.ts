import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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

describe('RoomsService.getFurnishableRoom', () => {
  const repo = { findOwned: jest.fn(async (id: string) => (id === 'closet' ? room({ name: 'Walk-in', furnish: false }) : room({ furnish: true }))) };
  const service = new RoomsService(repo as unknown as RoomsRepository);

  it('loads rooms that get furniture and refuses plan-only ones', async () => {
    expect((await service.getFurnishableRoom('r1', 'u1')).name).toBe('Living');
    await expect(service.getFurnishableRoom('closet', 'u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses rooms whose kind the engine cannot furnish yet', async () => {
    const svc = new RoomsService({ findOwned: jest.fn(async () => room({ name: 'Chambre', kind: 'bedroom', furnish: true })) } as unknown as RoomsRepository);
    await expect(svc.getFurnishableRoom('r1', 'u1')).rejects.toThrow(/can't furnish bedroom rooms yet/);
  });

  it('defaults furnish from the kind on create', () => {
    expect(CreateRoomSchema.parse({ name: 'Walk-in', kind: 'closet', floorPlan: { width: 1.6, depth: 1.9 } })).toMatchObject({ kind: 'closet' });
  });
});

describe('RoomsService furnish rules', () => {
  const repo = {
    create: jest.fn(async () => room()),
    createMany: jest.fn(async () => [room()]),
    findOwned: jest.fn(async () => room({ kind: 'living', furnish: true })),
    update: jest.fn(async (_id: string, dto: object) => room(dto)),
  };
  const service = new RoomsService(repo as unknown as RoomsRepository);
  const plan = { width: 3, depth: 3 };
  beforeEach(() => jest.clearAllMocks());

  it('will not switch furnishing on for a bedroom', async () => {
    await expect(service.create('u1', CreateRoomSchema.parse({ name: 'Chambre', kind: 'bedroom', furnish: true, floorPlan: plan }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createMany('u1', 'p1', [CreateRoomSchema.parse({ name: 'Chambre', kind: 'bedroom', furnish: true, floorPlan: plan })])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('r1', 'u1', { kind: 'bedroom', furnish: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stops furnishing a room turned into a bedroom', async () => {
    await service.update('r1', 'u1', { kind: 'bedroom' });
    expect(repo.update).toHaveBeenCalledWith('r1', { kind: 'bedroom', furnish: false });
  });
});
