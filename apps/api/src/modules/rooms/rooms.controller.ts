import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/auth/auth.decorators';
import { ZodPipe } from '../../common/validation/zod.pipe';
import { CreateRoomDto, CreateRoomSchema } from './dto/create-room.dto';
import { UpdateRoomDto, UpdateRoomSchema } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

/** HTTP in/out for rooms. No logic here. */
@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateRoomSchema)) dto: CreateRoomDto) {
    return this.rooms.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.rooms.list(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.findOne(id, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateRoomSchema)) dto: UpdateRoomDto,
  ) {
    return this.rooms.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.remove(id, user.id);
  }
}
