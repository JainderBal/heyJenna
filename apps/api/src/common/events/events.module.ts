import { Global, Module } from '@nestjs/common';
import { RoomEventsService } from './events.service';

@Global()
@Module({ providers: [RoomEventsService], exports: [RoomEventsService] })
export class EventsModule {}
