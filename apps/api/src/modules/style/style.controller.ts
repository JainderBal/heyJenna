import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AddPinsRequest } from '@hey-jenna/contracts';
import { AuthUser, CurrentUser } from '../../common/auth/auth.decorators';
import { ZodPipe } from '../../common/validation/zod.pipe';
import { MoodboardUrlsSchema } from './dto/moodboard-urls.dto';
import { UpdateStyleDto, UpdateStyleSchema } from './dto/update-style.dto';
import { StyleService } from './style.service';

const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/;

@Controller('rooms/:roomId')
export class StyleController {
  constructor(private readonly style: StyleService) {}

  /**
   * POST /rooms/:roomId/moodboard  (multipart/form-data)
   *   images:    1-8 image files (≤10 MB each)
   *   imageUrls: optional JSON array of https image links
   * ?append=1 adds them to the images already on the board (max 8 in all); without it they replace the board.
   */
  @Post('moodboard')
  @UseInterceptors(
    FilesInterceptor('images', 8, {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => cb(null, IMAGE_TYPES.test(file.mimetype)),
    }),
  )
  analyse(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @UploadedFiles() files: Express.Multer.File[] = [],
    @Body('imageUrls') imageUrls?: string,
    @Query('append') append?: string,
  ) {
    const urls = imageUrls ? new ZodPipe(MoodboardUrlsSchema).transform(safeJson(imageUrls)) : [];
    return this.style.analyseMoodboard(roomId, user.id, files, urls, { append: isOn(append) });
  }

  /** POST /rooms/:roomId/moodboard/pins  { pins: [{ id, imageUrl (i.pinimg.com), link? }] } */
  @Post('moodboard/pins')
  addPins(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body(new ZodPipe(AddPinsRequest)) dto: AddPinsRequest,
  ) {
    return this.style.addPins(roomId, user.id, dto.pins);
  }

  /** GET /rooms/:roomId/moodboard → { images: [{ id, url, source: 'upload' | 'pin', link? }] } */
  @Get('moodboard')
  images(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    return this.style.listImages(roomId, user.id);
  }

  /** GET /rooms/:roomId/moodboard/images/:imageId → the stored file (private cache only: it sits behind login) */
  @Get('moodboard/images/:imageId')
  async imageFile(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { data, contentType } = await this.style.imageFile(roomId, user.id, imageId);
    res.setHeader('content-type', contentType);
    res.setHeader('cache-control', 'private, max-age=86400');
    return new StreamableFile(data);
  }

  /** DELETE /rooms/:roomId/moodboard/images/:imageId → { images } left; style is re-derived (cleared when none are left) */
  @Delete('moodboard/images/:imageId')
  removeImage(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.style.removeImage(roomId, user.id, imageId);
  }

  @Get('style')
  get(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) {
    return this.style.get(roomId, user.id);
  }

  @Patch('style')
  update(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body(new ZodPipe(UpdateStyleSchema)) dto: UpdateStyleDto,
  ) {
    return this.style.update(roomId, user.id, dto);
  }
}

/** Query flags as elsewhere in the API: `1` or `true` is on; anything else, or no flag, is off. */
export function isOn(flag: string | undefined): boolean {
  return flag === '1' || flag === 'true';
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
