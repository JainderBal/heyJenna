import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../../common/auth/auth.decorators';
import { ZodPipe } from '../../common/validation/zod.pipe';
import { AddLinkDto, AddLinkSchema } from './dto/add-link.dto';
import { ListListingsDto, ListListingsSchema } from './dto/list-listings.dto';
import { SearchListingsDto, SearchListingsSchema } from './dto/search-listings.dto';
import { SourcingService } from './sourcing.service';

const PickSchema = z.object({ picked: z.boolean() });

@Controller('rooms/:roomId/listings')
export class SourcingController {
  constructor(private readonly sourcing: SourcingService) {}

  /** Search every enabled source for the room's shopping list, in the moodboard's style. */
  @Post('search')
  search(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body(new ZodPipe(SearchListingsSchema)) dto: SearchListingsDto,
  ) {
    return this.sourcing.search(roomId, user.id, dto);
  }

  /** Add a product the person found themselves (eBay, Kijiji, FB Marketplace, IKEA, any shop). */
  @Post('link')
  addLink(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Body(new ZodPipe(AddLinkSchema)) dto: AddLinkDto) {
    return this.sourcing.addLink(roomId, user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string, @Query(new ZodPipe(ListListingsSchema)) q: ListListingsDto) {
    return this.sourcing.list(roomId, user.id, q.type);
  }

  /** Choose (or un-choose) this product for its spot in the room. */
  @Patch(':listingId')
  pick(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Body(new ZodPipe(PickSchema)) body: { picked: boolean },
  ) {
    return this.sourcing.setPicked(roomId, user.id, listingId, body.picked);
  }
}
