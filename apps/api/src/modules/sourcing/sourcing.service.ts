import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FloorPlan, FurnitureType } from '@hey-jenna/contracts';
import { Listing, Room } from '@prisma/client';
import { AppConfig } from '../../common/config/app-config.service';
import { RoomsService } from '../rooms/rooms.service';
import { StyleService } from '../style/style.service';
import { parseIkeaMeasurements } from './adapters/ikea-product-page';
import { LinkAdapter } from './adapters/link.adapter';
import { safeFetch } from '../../common/http/safe-fetch';
import { Prisma } from '@prisma/client';
import { SOURCE_ADAPTERS, SourceAdapter } from './adapters/source.adapter';
import { AddLinkDto } from './dto/add-link.dto';
import { ListingResponseDto, SearchSummaryDto } from './dto/listing-response.dto';
import { SearchListingsDto } from './dto/search-listings.dto';
import { ListingsRepository, NewListing } from './listings.repository';
import { toListingResponse } from './mappers/listing.mapper';
import { classifyTitle } from './matching/classify';
import { buildListing } from './matching/listing-builder';
import { buildQuery } from './matching/query';
import { shoppingList, Slot } from './matching/shopping-list';

export interface ChosenSlot {
  slot: Slot;
  listings: Listing[]; // best first; picked ones always first
}

/** Finds real products that match the room's moodboard, and remembers which ones the person picked. */
@Injectable()
export class SourcingService {
  private readonly log = new Logger(SourcingService.name);

  constructor(
    private readonly repo: ListingsRepository,
    private readonly rooms: RoomsService,
    private readonly style: StyleService,
    private readonly link: LinkAdapter,
    private readonly config: AppConfig,
    @Inject(SOURCE_ADAPTERS) private readonly adapters: SourceAdapter[],
  ) {}

  async search(roomId: string, ownerId: string, dto: SearchListingsDto): Promise<SearchSummaryDto> {
    const room = await this.rooms.getOwnedRoom(roomId, ownerId);
    const style = await this.style.getProfile(roomId);
    if (!style) throw new ConflictException('Upload a moodboard first: products are matched to its style');
    const plan = room.floorPlan as unknown as FloorPlan;

    const slots = shoppingList(plan, room.needs).filter((s) => !dto.types || dto.types.includes(s.type));
    const active = this.activeAdapters();
    const summary: SearchSummaryDto = {
      searched: [], sources: active.map((a) => a.name),
      skippedSources: this.adapters.filter((a) => !active.includes(a)).map((a) => a.name),
      errors: [], listings: [],
    };

    const keep: NewListing[] = [];
    await Promise.all(
      slots.map(async (slot) => {
        const query = buildQuery(slot.type, style);
        const perSlot = dto.perType * slot.count;
        const results = await Promise.all(
          active.map((a) =>
            a.search({ type: slot.type, text: query, limit: perSlot * 2 }).catch((e: Error) => {
              summary.errors.push(`${a.name} (${slot.type}): ${e.message}`);
              return [];
            }),
          ),
        );
        const seenUrls = new Set<string>();
        const built = results
          .flat()
          .filter((r) => !seenUrls.has(r.url) && seenUrls.add(r.url))
          .map((r) => buildListing(r, slot.type, style, plan))
          .filter((l): l is NewListing => l !== null)
          .filter((l) => dto.maxPrice === undefined || (l.price != null && l.price <= dto.maxPrice))
          .sort((a, b) => b.score - a.score)
          .slice(0, perSlot);
        summary.searched.push({ type: slot.type, query, found: results.flat().length, kept: built.length });
        keep.push(...built);
      }),
    );

    const saved = await this.repo.replaceUnpicked(roomId, slots.map((s) => s.type), keep);
    summary.listings = saved.sort((a, b) => a.type.localeCompare(b.type) || b.score - a.score).map(toListingResponse);
    this.log.log(`room ${roomId}: kept ${saved.length} listings from ${summary.sources.join(', ')}`);
    return summary;
  }

  async addLink(roomId: string, ownerId: string, dto: AddLinkDto): Promise<ListingResponseDto> {
    const room = await this.rooms.getOwnedRoom(roomId, ownerId);
    let raw;
    try {
      raw = await this.link.read(dto.url);
    } catch (e) {
      throw new BadRequestException(`Could not read that link: ${(e as Error).message}`);
    }
    const type: FurnitureType | null = dto.type ?? classifyTitle(raw.title);
    if (!type) throw new BadRequestException(`Couldn't tell what "${raw.title}" is. Send it again with a "type".`);
    const style = await this.style.getProfile(roomId);
    const built = buildListing(raw, type, style, room.floorPlan as unknown as FloorPlan);
    if (!built) throw new BadRequestException(`That link looks like a ${classifyTitle(raw.title)}, not a ${type}`);
    const saved = await this.repo.upsertOne(roomId, { ...built, picked: true }); // they chose it, so it's picked
    await this.limitPicked(room, saved);
    return toListingResponse(saved);
  }

  async list(roomId: string, ownerId: string, type?: FurnitureType): Promise<ListingResponseDto[]> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    return (await this.repo.listByRoom(roomId, type)).map(toListingResponse);
  }

  async setPicked(roomId: string, ownerId: string, listingId: string, picked: boolean): Promise<ListingResponseDto> {
    const room = await this.rooms.getOwnedRoom(roomId, ownerId);
    const listing = await this.repo.findInRoom(listingId, roomId);
    if (!listing) throw new NotFoundException('Listing not found');
    const saved = await this.repo.setPicked(listing.id, picked);
    if (picked) await this.limitPicked(room, saved);
    return toListingResponse(saved);
  }

  /** For the layout module: one listing from this room (caller must own the room). */
  async getListing(roomId: string, listingId: string): Promise<Listing | null> {
    return this.repo.findInRoom(listingId, roomId);
  }

  /** For the layout module: per slot, the listings to use (picked first, then best score). */
  async chooseForRoom(room: Room): Promise<ChosenSlot[]> {
    const all = await this.repo.listByRoom(room.id);
    const chosen = shoppingList(room.floorPlan as unknown as FloorPlan, room.needs).map((slot) => ({
      slot,
      listings: all.filter((l) => l.type === slot.type).slice(0, slot.count),
    }));
    // IKEA search results have no sizes: read the real ones for just the pieces going into the room
    for (const c of chosen)
      c.listings = await Promise.all(c.listings.map((l) => (l.source === 'ikea' && l.sizeEstimated ? this.ikeaSize(l) : l)));
    return chosen;
  }

  /** Reads width/depth/height from the IKEA product page once and stores it. Keeps the estimate on failure. */
  private async ikeaSize(listing: Listing): Promise<Listing> {
    try {
      const { body } = await safeFetch(listing.url, { accept: 'text/html', maxBytes: 4 * 1024 * 1024 });
      const size = parseIkeaMeasurements(body.toString('utf8'));
      if (!size) return listing;
      this.log.log(`IKEA size for ${listing.title.slice(0, 40)}: ${size.w}×${size.d}×${size.h} m`);
      return await this.repo.setSize(listing.id, size as unknown as Prisma.InputJsonValue);
    } catch (e) {
      this.log.warn(`couldn't read IKEA size for ${listing.url}: ${(e as Error).message}`);
      return listing;
    }
  }

  /** A slot holds `count` pieces (e.g. 2 armchairs): picking more unpicks the older extras. */
  private async limitPicked(room: Room, saved: Listing): Promise<void> {
    const count = shoppingList(room.floorPlan as unknown as FloorPlan, room.needs).find((s) => s.type === saved.type)?.count ?? 1;
    const others = (await this.repo.listByRoom(room.id, saved.type)).filter((l) => l.picked && l.id !== saved.id);
    for (const extra of others.slice(Math.max(0, count - 1))) await this.repo.setPicked(extra.id, false);
  }

  private activeAdapters(): SourceAdapter[] {
    const wanted = this.config.get('SOURCES').split(',').map((s) => s.trim());
    return this.adapters.filter((a) => wanted.includes(a.name) && a.enabled());
  }
}
