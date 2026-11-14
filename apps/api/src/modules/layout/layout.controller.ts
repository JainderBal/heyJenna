import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/auth/auth.decorators';
import { ZodPipe } from '../../common/validation/zod.pipe';
import { EditObjectDto, EditObjectSchema } from './dto/move-object.dto';
import { AddObjectDto, AddObjectSchema } from './dto/add-object.dto';
import { LayoutService } from './layout.service';

@Controller('rooms/:roomId/layouts')
export class LayoutController {
  constructor(private readonly layouts: LayoutService) {}

  /** Place the room's chosen products (picked first, else best match) with the design rules. */
  @Post()
  generate(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    return this.layouts.generate(roomId, user.id);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    return this.layouts.list(roomId, user.id);
  }

  @Get(':layoutId')
  get(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Param('layoutId', ParseUUIDPipe) layoutId: string) {
    return this.layouts.get(roomId, user.id, layoutId);
  }

  @Get(':layoutId/shopping-list')
  shoppingList(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Param('layoutId', ParseUUIDPipe) layoutId: string) {
    return this.layouts.shoppingList(roomId, user.id, layoutId);
  }

  /** Add one of the room's products ({listingId}): a wall piece optionally at {wall, position, height}, a floor piece optionally at {x, y, rotationDeg}. */
  @Post(':layoutId/objects')
  add(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('layoutId', ParseUUIDPipe) layoutId: string,
    @Body(new ZodPipe(AddObjectSchema)) dto: AddObjectDto,
  ) {
    return this.layouts.addObject(roomId, user.id, layoutId, dto);
  }

  /** Move / turn a piece ({x, y, rotationDeg}), swap its product ({listingId}), or re-hang a wall piece ({wall, position, height}). */
  @Patch(':layoutId/objects/:objectId')
  edit(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('layoutId', ParseUUIDPipe) layoutId: string,
    @Param('objectId') objectId: string,
    @Body(new ZodPipe(EditObjectSchema)) dto: EditObjectDto,
  ) {
    return this.layouts.editObject(roomId, user.id, layoutId, objectId, dto);
  }

  @Delete(':layoutId/objects/:objectId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('layoutId', ParseUUIDPipe) layoutId: string,
    @Param('objectId') objectId: string,
  ) {
    return this.layouts.removeObject(roomId, user.id, layoutId, objectId);
  }
}
