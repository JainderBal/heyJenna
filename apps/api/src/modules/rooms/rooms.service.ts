import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Room } from '@prisma/client';
import { FloorPlan } from '@hey-jenna/contracts';
import { CreateRoomDto } from './dto/create-room.dto';
import { RoomResponseDto } from './dto/room-response.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { toRoomResponse } from './mappers/room.mapper';
import { RoomsRepository } from './rooms.repository';
import { floorPlanProblems } from './rooms.validation';

/** Room logic. Other modules use getOwnedRoom() to load a room safely. */
@Injectable()
export class RoomsService {
  constructor(private readonly repo: RoomsRepository) {}

  async create(ownerId: string, dto: CreateRoomDto): Promise<RoomResponseDto> {
    this.assertValidPlan(dto.floorPlan);
    if (dto.projectId) await this.assertOwnedProject(dto.projectId, ownerId);
    return toRoomResponse(await this.repo.create(ownerId, dto));
  }

  /** Creates several rooms in a project at once. Every floor plan is checked first; one bad plan creates nothing. */
  async createMany(ownerId: string, projectId: string, rooms: CreateRoomDto[]): Promise<RoomResponseDto[]> {
    const problems = rooms.flatMap((r, i) => floorPlanProblems(r.floorPlan).map((p) => `rooms[${i}] (${r.name}): ${p}`));
    if (problems.length) throw new BadRequestException({ message: 'Floor plan has problems', problems });
    return (await this.repo.createMany(ownerId, projectId, rooms)).map(toRoomResponse);
  }

  async listByProject(projectId: string, ownerId: string): Promise<RoomResponseDto[]> {
    return (await this.repo.listByProject(projectId, ownerId)).map(toRoomResponse);
  }

  async list(ownerId: string): Promise<RoomResponseDto[]> {
    return (await this.repo.listByOwner(ownerId)).map(toRoomResponse);
  }

  async findOne(id: string, ownerId: string): Promise<RoomResponseDto> {
    return toRoomResponse(await this.getOwnedRoom(id, ownerId));
  }

  async update(id: string, ownerId: string, dto: UpdateRoomDto): Promise<RoomResponseDto> {
    await this.getOwnedRoom(id, ownerId);
    if (dto.floorPlan) this.assertValidPlan(dto.floorPlan);
    if (dto.projectId) await this.assertOwnedProject(dto.projectId, ownerId);
    return toRoomResponse(await this.repo.update(id, dto));
  }

  async remove(id: string, ownerId: string): Promise<void> {
    await this.getOwnedRoom(id, ownerId);
    await this.repo.delete(id);
  }

  /** Loads a room only if it belongs to this user; otherwise 404 (we don't reveal it exists). */
  async getOwnedRoom(id: string, ownerId: string): Promise<Room> {
    const room = await this.repo.findOwned(id, ownerId);
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  private async assertOwnedProject(projectId: string, ownerId: string) {
    if (!(await this.repo.projectOwned(projectId, ownerId))) throw new NotFoundException('Project not found');
  }

  private assertValidPlan(plan: FloorPlan) {
    const problems = floorPlanProblems(plan);
    if (problems.length) throw new BadRequestException({ message: 'Floor plan has problems', problems });
  }
}
