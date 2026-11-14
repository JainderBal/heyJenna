import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfig } from '@nestjs/config';
import { AppConfig } from './app-config.service';
import { validateEnv } from './env';

@Global()
@Module({
  imports: [NestConfig.forRoot({ isGlobal: true, validate: validateEnv })],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class ConfigModule {}
