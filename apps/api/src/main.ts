import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './common/config/app-config.service';
import { csv } from './common/config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfig);
  // Only the UI's origins, with credentials so cookies / EventSource({withCredentials}) work cross-origin.
  app.enableCors({
    origin: csv(config.get('CORS_ORIGINS')),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'x-dev-user', 'last-event-id', 'cache-control'],
    exposedHeaders: ['x-cache'],
    maxAge: 600,
  });
  app.enableShutdownHooks();
  const port = config.get('PORT');
  await app.listen(port);
  console.log(`hey jenna API on http://localhost:${port}`);
}
bootstrap();
