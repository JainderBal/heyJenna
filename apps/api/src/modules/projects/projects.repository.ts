import { Injectable } from '@nestjs/common';
import { Project } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

/** The only place that queries the projects table. Every query is scoped to the owner. */
@Injectable()
export class ProjectsRepository {
  constructor(private readonly db: PrismaService) {}

  create(ownerId: string, dto: CreateProjectDto): Promise<Project> {
    return this.db.project.create({ data: { ownerId, name: dto.name, kind: dto.kind ?? null, palette: dto.palette ?? [] } });
  }

  listByOwner(ownerId: string): Promise<Project[]> {
    return this.db.project.findMany({ where: { ownerId }, orderBy: { updatedAt: 'desc' } });
  }

  findOwned(id: string, ownerId: string): Promise<Project | null> {
    return this.db.project.findFirst({ where: { id, ownerId } });
  }

  update(id: string, dto: UpdateProjectDto): Promise<Project> {
    return this.db.project.update({ where: { id }, data: { name: dto.name, kind: dto.kind, palette: dto.palette } });
  }

  /** Rooms in the project are kept (their project_id is set to null). */
  async delete(id: string): Promise<void> {
    await this.db.project.delete({ where: { id } });
  }
}
