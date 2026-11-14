import { Injectable } from '@nestjs/common';
import { Prisma, Room } from '@prisma/client';
import { PlanPosition, furnishedByDefault } from '@hey-jenna/contracts';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

/** The only place that queries the rooms table. Every query is scoped to the owner. */
@Injectable()
export class RoomsRepository {
  constructor(private readonly db: PrismaService) {}

  create(ownerId: string, dto: CreateRoomDto): Promise<Room> {
    return this.db.room.create({
      data: {
        ownerId,
        name: dto.name,
        floorPlan: dto.floorPlan as Prisma.InputJsonValue,
        needs: dto.needs,
        kind: dto.kind ?? null,
        furnish: dto.furnish ?? furnishedByDefault(dto.kind),
        budgetCad: dto.budgetCad ?? null,
        projectId: dto.projectId ?? null,
        ...planColumns(dto.planPosition),
      },
    });
  }

  /** Creates several rooms in one transaction (all or nothing). */
  createMany(ownerId: string, projectId: string, rooms: CreateRoomDto[]): Promise<Room[]> {
    return this.db.$transaction(
      rooms.map((r) =>
        this.db.room.create({
          data: {
            ownerId,
            projectId,
            name: r.name,
            floorPlan: r.floorPlan as Prisma.InputJsonValue,
            needs: r.needs,
            kind: r.kind ?? null,
            furnish: r.furnish ?? furnishedByDefault(r.kind),
            budgetCad: r.budgetCad ?? null,
            ...planColumns(r.planPosition),
          },
        }),
      ),
    );
  }

  listByProject(projectId: string, ownerId: string): Promise<Room[]> {
    return this.db.room.findMany({ where: { projectId, ownerId }, orderBy: { createdAt: 'asc' } });
  }

  /** True when the project exists and belongs to this owner (rooms may only join the caller's projects). */
  async projectOwned(projectId: string, ownerId: string): Promise<boolean> {
    return (await this.db.project.count({ where: { id: projectId, ownerId } })) > 0;
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
        kind: dto.kind,
        furnish: dto.furnish,
        budgetCad: dto.budgetCad,
        projectId: dto.projectId,
        floorPlan: dto.floorPlan ? (dto.floorPlan as Prisma.InputJsonValue) : undefined,
        ...planColumns(dto.planPosition),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.room.delete({ where: { id } });
  }
}

/** planPosition → the plan_x / plan_y columns. undefined = leave as is, null = clear (not placed). */
export function planColumns(pos: PlanPosition | null | undefined): { planX?: number | null; planY?: number | null } {
  if (pos === undefined) return {};
  return { planX: pos?.x ?? null, planY: pos?.y ?? null };
}
