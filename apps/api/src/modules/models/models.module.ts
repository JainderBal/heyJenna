import { Module } from '@nestjs/common';
import { SourcingModule } from '../sourcing/sourcing.module';
import { ModelsController } from './models.controller';
import { ModelsService } from './models.service';

@Module({ imports: [SourcingModule], controllers: [ModelsController], providers: [ModelsService] })
export class ModelsModule {}
