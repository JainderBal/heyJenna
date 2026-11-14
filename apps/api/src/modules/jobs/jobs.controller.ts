import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { Job } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/auth/auth.decorators';
import { JobsService } from '../../common/jobs/jobs.service';
import { RoomsService } from '../rooms/rooms.service';

/** Poll a background job (for clients that can't keep the live-update stream open). */
@Controller('rooms/:roomId/jobs')
export class JobsController {
  constructor(private readonly rooms: RoomsService, private readonly jobs: JobsService) {}

  @Get(':jobId')
  async get(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Param('jobId', ParseUUIDPipe) jobId: string) {
    await this.rooms.getOwnedRoom(roomId, user.id);
    const job = await this.jobs.findInRoom(jobId, roomId);
    if (!job) throw new NotFoundException('Job not found');
    return toJobResponse(job);
  }
}

function toJobResponse(j: Job) {
  return {
    id: j.id, kind: j.kind, status: j.status, attempts: j.attempts, maxAttempts: j.maxAttempts,
    result: j.result, error: j.error, createdAt: j.createdAt, startedAt: j.startedAt, finishedAt: j.finishedAt,
  };
}
