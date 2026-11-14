import { Injectable } from '@nestjs/common';
import { Layout, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { LayoutData } from './layout.types';

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** The only place that queries the layouts table. */
@Injectable()
export class LayoutsRepository {
  constructor(private readonly db: PrismaService) {}

  create(roomId: string, data: LayoutData): Promise<Layout> {
    return this.db.layout.create({ data: { roomId, data: json(data), summary: json(data.summary) } });
  }

  listByRoom(roomId: string): Promise<Layout[]> {
    return this.db.layout.findMany({ where: { roomId }, orderBy: { createdAt: 'desc' } });
  }

  findInRoom(id: string, roomId: string): Promise<Layout | null> {
    return this.db.layout.findFirst({ where: { id, roomId } });
  }

  save(id: string, data: LayoutData): Promise<Layout> {
    return this.db.layout.update({ where: { id }, data: { data: json(data), summary: json(data.summary) } });
  }
}
