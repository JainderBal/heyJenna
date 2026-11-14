import { NotFoundException } from '@nestjs/common';
import { Project } from '@prisma/client';
import { RoomsService } from '../rooms/rooms.service';
import { BulkRoomsSchema } from './dto/bulk-rooms.dto';
import { UpdateProjectSchema } from './dto/update-project.dto';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

const row = (extra: Partial<Project> = {}): Project => ({
  id: 'p1', ownerId: 'u1', name: 'Dundas condo', kind: 'condo', palette: ['#C46A3A'], budgetCad: null,
  createdAt: new Date('2026-11-12T00:00:00Z'), updatedAt: new Date('2026-11-12T00:00:00Z'), ...extra,
});
const plan = { width: 4, depth: 3.5 };

describe('ProjectsService', () => {
  const repo = {
    create: jest.fn(async (ownerId: string, dto: { name: string }) => row({ ownerId, name: dto.name, kind: null, palette: [] })),
    findOwned: jest.fn(async (id: string, ownerId: string) => (id === 'p1' && ownerId === 'u1' ? row() : null)),
    update: jest.fn(async () => row({ name: 'Renamed' })),
    delete: jest.fn(async () => undefined),
  };
  const rooms = { createMany: jest.fn(async () => []), listByProject: jest.fn(async () => []) };
  const service = new ProjectsService(repo as unknown as ProjectsRepository, rooms as unknown as RoomsService);
  beforeEach(() => jest.clearAllMocks());

  it('creates a project and maps it to the response shape', async () => {
    const res = await service.create('u1', { name: 'Cottage' });
    expect(res).toEqual({ id: 'p1', name: 'Cottage', kind: null, palette: [], budgetCad: null, createdAt: '2026-11-12T00:00:00.000Z', updatedAt: '2026-11-12T00:00:00.000Z' });
  });

  it("hides other people's projects behind a 404, for every route", async () => {
    await expect(service.findOne('p1', 'u2')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('p1', 'u2', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('p1', 'u2')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listRooms('p1', 'u2')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.createRooms('p1', 'u2', { rooms: [] })).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
    expect(rooms.createMany).not.toHaveBeenCalled();
  });

  it('bulk-creates rooms in the owned project through RoomsService', async () => {
    const dto = BulkRoomsSchema.parse({ rooms: [{ name: 'Living', floorPlan: plan }, { name: 'Bed', floorPlan: plan }] });
    await service.createRooms('p1', 'u1', dto);
    expect(rooms.createMany).toHaveBeenCalledWith('u1', 'p1', dto.rooms);
  });

  it('validates the bulk and patch bodies', () => {
    expect(BulkRoomsSchema.safeParse({ rooms: [] }).success).toBe(false);
    expect(BulkRoomsSchema.parse({ rooms: [{ name: 'Den', floorPlan: plan }] }).rooms[0].needs).toEqual([]);
    expect(UpdateProjectSchema.safeParse({ kind: null }).success).toBe(true);
    expect(UpdateProjectSchema.safeParse({ palette: ['red'] }).success).toBe(false);
    expect(UpdateProjectSchema.safeParse({ budgetCad: null }).success).toBe(true);
    expect(UpdateProjectSchema.safeParse({ budgetCad: 12000 }).success).toBe(true);
    expect(UpdateProjectSchema.safeParse({ budgetCad: 0 }).success).toBe(false);
  });
});
