import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { SourcingModule } from '../sourcing/sourcing.module';
import { StyleModule } from '../style/style.module';
import { LAYOUT_ENGINE } from './engine/layout-engine';
import { PythonLayoutEngine } from './engine/python-layout.engine';
import { LayoutController } from './layout.controller';
import { LayoutService } from './layout.service';
import { LayoutsRepository } from './layouts.repository';

@Module({
  imports: [RoomsModule, StyleModule, SourcingModule],
  controllers: [LayoutController],
  providers: [
    LayoutService,
    LayoutsRepository,
    // swap this one line to change engines (e.g. a TypeScript port later)
    { provide: LAYOUT_ENGINE, useClass: PythonLayoutEngine },
  ],
  exports: [LayoutService],
})
export class LayoutModule {}
