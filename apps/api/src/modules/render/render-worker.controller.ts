import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Public } from '../../common/auth/auth.decorators';
import { ZodPipe } from '../../common/validation/zod.pipe';
import { ClaimDto, ClaimSchema, FailDto, FailSchema } from './dto/worker.dto';
import { RenderService } from './render.service';
import { WorkerTokenGuard } from './worker-token.guard';

/** Internal: only render workers (x-worker-token), never people. */
@Public()
@UseGuards(WorkerTokenGuard)
@Controller('internal/render-jobs')
export class RenderWorkerController {
  constructor(private readonly render: RenderService) {}

  /** Next job + its layout, or 204 when the queue is empty. */
  @Post('claim')
  @HttpCode(200)
  async claim(@Body(new ZodPipe(ClaimSchema)) dto: ClaimDto) {
    return (await this.render.claim(dto.workerId)) ?? { job: null };
  }

  /** multipart: image (PNG, required), model (.glb, optional) */
  @Post(':jobId/complete')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'image', maxCount: 1 }, { name: 'model', maxCount: 1 }], { limits: { fileSize: 60 * 1024 * 1024 } }))
  complete(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @UploadedFiles() files: { image?: Express.Multer.File[]; model?: Express.Multer.File[] },
  ) {
    return this.render.complete(jobId, files?.image?.[0]?.buffer, files?.model?.[0]?.buffer);
  }

  @Post(':jobId/fail')
  fail(@Param('jobId', ParseUUIDPipe) jobId: string, @Body(new ZodPipe(FailSchema)) dto: FailDto) {
    return this.render.fail(jobId, dto.error);
  }
}
