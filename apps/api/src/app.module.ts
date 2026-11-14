import { Module } from '@nestjs/common';
import { AuthModule } from './common/auth/auth.module';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './common/database/database.module';
import { EventsModule } from './common/events/events.module';
import { JobsModule } from './common/jobs/jobs.module';
import { StorageModule } from './common/storage/storage.module';
import { HealthController } from './health.controller';
import { RoomEventsModule } from './modules/events/events.module';
import { RoomJobsModule } from './modules/jobs/jobs.module';
import { ModelsModule } from './modules/models/models.module';
import { ChatModule } from './modules/chat/chat.module';
import { LayoutModule } from './modules/layout/layout.module';
import { RenderModule } from './modules/render/render.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { SourcingModule } from './modules/sourcing/sourcing.module';
import { StyleModule } from './modules/style/style.module';

@Module({
  imports: [ConfigModule, DatabaseModule, StorageModule, EventsModule, JobsModule, AuthModule, RoomsModule, StyleModule, SourcingModule, LayoutModule, RenderModule, RoomEventsModule, RoomJobsModule, ModelsModule, ChatModule],
  controllers: [HealthController],
})
export class AppModule {}
