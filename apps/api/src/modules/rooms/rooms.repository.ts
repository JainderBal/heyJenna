import { Injectable } from '@nestjs/common';
import { Prisma, Room } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

/** The only place that queries the rooms table. Every query is scoped to the owner. */
@Injectable()
export class RoomsRepository {
  constructor(private readonly db: PrismaService) {}

  create(ownerId: string, dto: CreateRoomDto): Promise<Room> {
    return this.db.room.create({
      data: { ownerId, name: dto.name, floorPlan: dto.floorPlan as Prisma.InputJsonValue, needs: dto.needs },
    });
  }

  listByOwner(ownerId: string): Promise<Room[]> {
    return this.db.room.findMany({ where: { ownerId }, orderBy: { updatedAt: 'desc' } });
  }

  findOwned(id: string, ownerId: string): Promise<Room | null> {
    return this.db.room.findFirst({ where: { id, ownerId } });
  }

  update(id: string, dto: UpdateRoomDto): Promise<Room> {
    return this.db.room.update({
      where: { id },
      data: {
        name: dto.name,
        needs: dto.needs,
        floorPlan: dto.floorPlan ? (dto.floorPlan as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.room.delete({ where: { id } });
  }
}
