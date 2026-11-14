import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { AppConfig } from '../../common/config/app-config.service';
import { ClaudeFloorPlanReader, FLOOR_PLAN_READER } from './floor-plan/floor-plan.reader';
import { FloorPlanService } from './floor-plan/floor-plan.service';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

@Module({
  imports: [RoomsModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    ProjectsRepository,
    FloorPlanService,
    {
      // Claude reads floor plans when a key is set; otherwise null → 422 (no fake detection)
      provide: FLOOR_PLAN_READER,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const key = config.get('ANTHROPIC_API_KEY');
        return key ? new ClaudeFloorPlanReader(key, config.get('ANTHROPIC_MODEL')) : null;
      },
    },
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
