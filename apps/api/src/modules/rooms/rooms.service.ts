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
    return toRoomResponse(await this.repo.create(ownerId, dto));
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

  private assertValidPlan(plan: FloorPlan) {
    const problems = floorPlanProblems(plan);
    if (problems.length) throw new BadRequestException({ message: 'Floor plan has problems', problems });
  }
}
