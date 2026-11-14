import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { EventsController } from './events.controller';

@Module({ imports: [RoomsModule], controllers: [EventsController] })
export class RoomEventsModule {}
