import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { StyleModule } from '../style/style.module';
import { EbayAdapter } from './adapters/ebay.adapter';
import { LinkAdapter } from './adapters/link.adapter';
import { MockAdapter } from './adapters/mock.adapter';
import { SOURCE_ADAPTERS } from './adapters/source.adapter';
import { WebSearchAdapter } from './adapters/web-search.adapter';
import { ListingsRepository } from './listings.repository';
import { SourcingController } from './sourcing.controller';
import { SourcingService } from './sourcing.service';

@Module({
  imports: [RoomsModule, StyleModule],
  controllers: [SourcingController],
  providers: [
    SourcingService,
    ListingsRepository,
    LinkAdapter,
    MockAdapter,
    EbayAdapter,
    WebSearchAdapter,
    {
      // all sources as one list; SOURCES + each source's keys decide which actually run
      provide: SOURCE_ADAPTERS,
      inject: [MockAdapter, EbayAdapter, WebSearchAdapter],
      useFactory: (...adapters) => adapters,
    },
  ],
  exports: [SourcingService],
})
export class SourcingModule {}
