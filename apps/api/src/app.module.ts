import { Module } from '@nestjs/common';
import { AuthModule } from './common/auth/auth.module';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './common/database/database.module';
import { StorageModule } from './common/storage/storage.module';
import { HealthController } from './health.controller';
import { LayoutModule } from './modules/layout/layout.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { SourcingModule } from './modules/sourcing/sourcing.module';
import { StyleModule } from './modules/style/style.module';

@Module({
  imports: [ConfigModule, DatabaseModule, StorageModule, AuthModule, RoomsModule, StyleModule, SourcingModule, LayoutModule],
  controllers: [HealthController],
})
export class AppModule {}
