import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './common/config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.enableShutdownHooks();
  const port = app.get(AppConfig).get('PORT');
  await app.listen(port);
  console.log(`hey jenna API on http://localhost:${port}`);
}
bootstrap();
