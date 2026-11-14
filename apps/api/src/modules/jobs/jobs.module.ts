import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { JobsController } from './jobs.controller';

@Module({ imports: [RoomsModule], controllers: [JobsController] })
export class RoomJobsModule {}
