import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FloorPlan, FurnitureType } from '@hey-jenna/contracts';
import { Listing, Room } from '@prisma/client';
import { AppConfig } from '../../common/config/app-config.service';
import { RoomsService } from '../rooms/rooms.service';
import { StyleService } from '../style/style.service';
import { findIkeaModelUrl, findIkeaPrice, parseIkeaMeasurements } from './adapters/ikea-product-page';
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
import { buildQuery, queryParts } from './matching/query';
import { plausibleSize } from './matching/dimensions';
import { FurnitureType as FType } from '@hey-jenna/contracts';
import { shoppingList, Slot } from './matching/shopping-list';
import { chooseSet } from './matching/companions';

/** Pieces whose size has to suit the others: look at more candidates. */
const KEY_PIECES = ['sofa', 'coffee_table', 'rug', 'armchair', 'side_table'];

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
            a.search({ type: slot.type, text: query, limit: perSlot * 2, parts: queryParts(slot.type, style) }).catch((e: Error) => {
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

    // Only replace furniture types that came back with results: a failed or empty search keeps the old ones
    const refreshed = summary.searched.filter((s) => s.kept > 0).map((s) => s.type);
    const missing = summary.searched.filter((s) => s.kept === 0).map((s) => s.type);
    if (missing.length) summary.errors.push(`no results this time for: ${missing.join(', ')} (kept earlier results)`);
    const saved = await this.repo.replaceUnpicked(roomId, refreshed, keep);
    summary.listings = (await this.repo.listByRoom(roomId)).sort((a, b) => a.type.localeCompare(b.type) || b.score - a.score).map(toListingResponse);
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
    const plan = room.floorPlan as unknown as FloorPlan;
    const slots = shoppingList(plan, room.needs);
    const all = await this.repo.listByRoom(room.id);
    // Real sizes + 3D model links for the leading candidates (not just the winner), so pieces can be
    // matched to each other. Key pieces look at their top 4, the rest at their top 2. Each page is read once.
    const byType = new Map<string, Listing[]>();
    for (const slot of slots) {
      const ofType = all.filter((l) => l.type === slot.type).sort((a, b) => Number(b.picked) - Number(a.picked) || b.score - a.score);
      const depth = KEY_PIECES.includes(slot.type) ? 4 : 2;
      const head = await this.mapLimited(ofType.slice(0, depth * slot.count), 4, (l) => (l.source === 'ikea' && l.modelUrl === null ? this.ikeaDetails(l) : Promise.resolve(l)));
      byType.set(slot.type, [...head, ...ofType.slice(depth * slot.count)]);
    }
    return chooseSet(slots, byType, plan);
  }

  /** Runs fn over items, at most `limit` at a time (polite to the shop's servers). */
  private async mapLimited<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
    }));
    return out;
  }

  /**
   * Reads the IKEA product page once: real width/depth/height (if believable) and the link to the
   * 3D model IKEA's "View in 3D" viewer uses. Stored, so each product page is read at most once.
   */
  private async ikeaDetails(listing: Listing): Promise<Listing> {
    try {
      const { body } = await safeFetch(listing.url, { accept: 'text/html', maxBytes: 4 * 1024 * 1024 });
      const html = body.toString('utf8');
      let size = parseIkeaMeasurements(html);
      if (size && !plausibleSize(listing.type as FType, size)) {
        this.log.warn(`ignoring odd IKEA size for ${listing.title.slice(0, 40)}: ${size.w}×${size.d}×${size.h} m`);
        size = null;
      }
      const modelUrl = findIkeaModelUrl(html) ?? '';
      this.log.log(`IKEA ${listing.title.slice(0, 40)}: size ${size ? `${size.w}×${size.d}×${size.h} m` : 'estimated'}, 3D model ${modelUrl ? 'yes' : 'no'}`);
      const price = findIkeaPrice(html) ?? undefined;
      return await this.repo.setDetails(listing.id, { size: size ? (size as unknown as Prisma.InputJsonValue) : undefined, modelUrl, price });
    } catch (e) {
      this.log.warn(`couldn't read IKEA page ${listing.url}: ${(e as Error).message}`);
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
