import { Injectable, NotFoundException } from '@nestjs/common';
import { Project } from '@prisma/client';
import { RoomResponseDto } from '../rooms/dto/room-response.dto';
import { RoomsService } from '../rooms/rooms.service';
import { BulkRoomsDto } from './dto/bulk-rooms.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { toProjectResponse } from './mappers/project.mapper';
import { ProjectsRepository } from './projects.repository';

/** Project logic. Rooms are created and listed through RoomsService. */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly repo: ProjectsRepository,
    private readonly rooms: RoomsService,
  ) {}

  async create(ownerId: string, dto: CreateProjectDto): Promise<ProjectResponseDto> {
    return toProjectResponse(await this.repo.create(ownerId, dto));
  }

  async list(ownerId: string): Promise<ProjectResponseDto[]> {
    return (await this.repo.listByOwner(ownerId)).map(toProjectResponse);
  }

  async findOne(id: string, ownerId: string): Promise<ProjectResponseDto> {
    return toProjectResponse(await this.getOwnedProject(id, ownerId));
  }

  async update(id: string, ownerId: string, dto: UpdateProjectDto): Promise<ProjectResponseDto> {
    await this.getOwnedProject(id, ownerId);
    return toProjectResponse(await this.repo.update(id, dto));
  }

  async remove(id: string, ownerId: string): Promise<void> {
    await this.getOwnedProject(id, ownerId);
    await this.repo.delete(id);
  }

  async listRooms(id: string, ownerId: string): Promise<RoomResponseDto[]> {
    await this.getOwnedProject(id, ownerId);
    return this.rooms.listByProject(id, ownerId);
  }

  async createRooms(id: string, ownerId: string, dto: BulkRoomsDto): Promise<RoomResponseDto[]> {
    await this.getOwnedProject(id, ownerId);
    return this.rooms.createMany(ownerId, id, dto.rooms);
  }

  /** Loads a project only if it belongs to this user; otherwise 404 (we don't reveal it exists). */
  async getOwnedProject(id: string, ownerId: string): Promise<Project> {
    const project = await this.repo.findOwned(id, ownerId);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
