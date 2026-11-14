import { Module } from '@nestjs/common';
import { AuthModule } from './common/auth/auth.module';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './common/database/database.module';
import { StorageModule } from './common/storage/storage.module';
import { HealthController } from './health.controller';
import { RoomsModule } from './modules/rooms/rooms.module';

@Module({
  imports: [ConfigModule, DatabaseModule, StorageModule, AuthModule, RoomsModule],
  controllers: [HealthController],
})
export class AppModule {}
