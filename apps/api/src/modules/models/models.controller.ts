import { Controller, Get, Param, ParseUUIDPipe, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../../common/auth/auth.decorators';
import { ZodPipe } from '../../common/validation/zod.pipe';
import { ModelFile, ModelsService } from './models.service';

const ModelQuery = z.object({ url: z.string().min(1).max(2000) });

/** Product 3D models (GLB) for the viewer, fetched through us so the browser never talks to IKEA directly. */
@Controller()
export class ModelsController {
  constructor(private readonly models: ModelsService) {}

  @Get('models')
  async byUrl(@Query(new ZodPipe(ModelQuery)) q: { url: string }, @Res({ passthrough: true }) res: Response) {
    return send(await this.models.byUrl(q.url), res);
  }

  @Get('rooms/:roomId/listings/:listingId/model')
  async byListing(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send(await this.models.byListing(roomId, user.id, listingId), res);
  }
}

function send(model: ModelFile, res: Response): StreamableFile {
  res.setHeader('content-type', 'model/gltf-binary');
  // the file behind a URL never changes; "private" because the route needs a login
  res.setHeader('cache-control', 'private, max-age=31536000, immutable');
  res.setHeader('x-cache', model.cached ? 'hit' : 'miss');
  return new StreamableFile(model.data);
}
