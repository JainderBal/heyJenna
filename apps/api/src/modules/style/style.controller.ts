import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
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
  ) {
    const urls = imageUrls ? new ZodPipe(MoodboardUrlsSchema).transform(safeJson(imageUrls)) : [];
    return this.style.analyseMoodboard(roomId, user.id, files, urls);
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

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
