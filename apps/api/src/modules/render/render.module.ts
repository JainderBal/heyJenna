import { Module } from '@nestjs/common';
import { LayoutModule } from '../layout/layout.module';
import { RoomsModule } from '../rooms/rooms.module';
import { RenderWorkerController } from './render-worker.controller';
import { RenderController } from './render.controller';
import { RenderRepository } from './render.repository';
import { RenderService } from './render.service';
import { WorkerTokenGuard } from './worker-token.guard';

@Module({
  imports: [RoomsModule, LayoutModule],
  controllers: [RenderController, RenderWorkerController],
  providers: [RenderService, RenderRepository, WorkerTokenGuard],
})
export class RenderModule {}
