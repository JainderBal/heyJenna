import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/auth/auth.decorators';
import { ZodPipe } from '../../common/validation/zod.pipe';
import { BulkRoomsDto, BulkRoomsSchema } from './dto/bulk-rooms.dto';
import { CreateProjectDto, CreateProjectSchema } from './dto/create-project.dto';
import { UpdateProjectDto, UpdateProjectSchema } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

/** HTTP in/out for projects. No logic here. */
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateProjectSchema)) dto: CreateProjectDto) {
    return this.projects.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projects.findOne(id, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateProjectSchema)) dto: UpdateProjectDto,
  ) {
    return this.projects.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projects.remove(id, user.id);
  }

  @Get(':id/rooms')
  listRooms(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projects.listRooms(id, user.id);
  }

  @Post(':id/rooms/bulk')
  createRooms(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(BulkRoomsSchema)) dto: BulkRoomsDto,
  ) {
    return this.projects.createRooms(id, user.id, dto);
  }
}
