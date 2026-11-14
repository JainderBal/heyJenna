import { Controller, Get, Header, Param, ParseUUIDPipe, Post, StreamableFile } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/auth/auth.decorators';
import { RenderService } from './render.service';

/** What the app calls: start a render of a layout, check on it, fetch the picture / 3D model. */
@Controller('rooms/:roomId')
export class RenderController {
  constructor(private readonly render: RenderService) {}

  @Post('layouts/:layoutId/renders')
  request(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Param('layoutId', ParseUUIDPipe) layoutId: string) {
    return this.render.request(roomId, user.id, layoutId);
  }

  @Get('renders')
  list(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    return this.render.list(roomId, user.id);
  }

  @Get('renders/:jobId')
  get(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.render.get(roomId, user.id, jobId);
  }

  @Get('renders/:jobId/image')
  @Header('content-type', 'image/png')
  async image(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return new StreamableFile(await this.render.file(roomId, user.id, jobId, 'image'));
  }

  @Get('renders/:jobId/model')
  @Header('content-type', 'model/gltf-binary')
  async model(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return new StreamableFile(await this.render.file(roomId, user.id, jobId, 'model'));
  }
}
