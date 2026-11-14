import { Global, Module } from '@nestjs/common';
import { JobsRepository } from './jobs.repository';
import { JobsService } from './jobs.service';

@Global()
@Module({ providers: [JobsService, JobsRepository], exports: [JobsService] })
export class JobsModule {}
