import { BadRequestException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { FloorPlan, ListingSource, Size } from '@hey-jenna/contracts';
import { Layout, Listing } from '@prisma/client';
import { RoomsService } from '../rooms/rooms.service';
import { SourcingService } from '../sourcing/sourcing.service';
import { StyleService } from '../style/style.service';
import { EditObjectDto } from './dto/move-object.dto';
import { EditResultDto, LayoutResponseDto, ShoppingListDto } from './dto/layout-response.dto';
import { EditError, moveObject, overlapWarnings, removeObject } from './editing/edits';
import { insideRoom } from './editing/geometry';
import { EngineFailedError } from './engine/python-layout.engine';
import { LAYOUT_ENGINE, LayoutEngine } from './engine/layout-engine';
import { solveWithRepairs } from './engine/repair';
import { buildEngineSpec, ListingIndex } from './engine/spec-builder';
import { LayoutsRepository } from './layouts.repository';
import { LayoutData, PlacedObject, PlacedProduct } from './layout.types';
import { shoppingListOf, toLayoutResponse } from './mappers/layout.mapper';

/** Layers where an engine-added extra (e.g. a filler pouf) is something to buy. */
const SHOPPABLE_LAYERS = ['furniture', 'lighting', 'plants'];

/** Places the chosen products in the room, then lets the person move, swap and remove pieces. */
@Injectable()
export class LayoutService {
  constructor(
    private readonly repo: LayoutsRepository,
    private readonly rooms: RoomsService,
    private readonly style: StyleService,
    private readonly sourcing: SourcingService,
    @Inject(LAYOUT_ENGINE) private readonly engine: LayoutEngine,
  ) {}

  async generate(roomId: string, ownerId: string): Promise<LayoutResponseDto> {
    const room = await this.rooms.getOwnedRoom(roomId, ownerId);
    const plan = room.floorPlan as unknown as FloorPlan;
    const style = await this.style.getProfile(roomId);
    const chosen = await this.sourcing.chooseForRoom(room);
    const { spec, index } = buildEngineSpec(room.name, plan, room.needs, style, chosen);

    let solved;
    try {
      solved = await solveWithRepairs(this.engine, spec);
    } catch (e) {
      if (e instanceof EngineFailedError) throw new UnprocessableEntityException(`Couldn't lay out this room: ${e.message}`);
      throw e;
    }
    const suggestedIds = new Set(spec.furniture.filter((f) => f.suggested).map((f) => f.id));
    const specIds = new Set(spec.furniture.map((f) => f.id));
    const objects = solved.result.objects.map((o) => attach(o as PlacedObject, index, suggestedIds, specIds));
    const data: LayoutData = { ...solved.result, objects, dropped: solved.dropped, edits: 0 };
    return toLayoutResponse(await this.repo.create(roomId, data));
  }

  async list(roomId: string, ownerId: string): Promise<LayoutResponseDto[]> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    return (await this.repo.listByRoom(roomId)).map(toLayoutResponse);
  }

  async get(roomId: string, ownerId: string, layoutId: string): Promise<LayoutResponseDto> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    return toLayoutResponse(await this.load(roomId, layoutId));
  }

  /** For the render module: the stored layout (checks the person owns the room). */
  async getData(roomId: string, ownerId: string, layoutId: string): Promise<LayoutData> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    return (await this.load(roomId, layoutId)).data as unknown as LayoutData;
  }

  /** For render workers (no user): the stored layout by id. */
  async getDataForWorker(roomId: string, layoutId: string): Promise<LayoutData> {
    return (await this.load(roomId, layoutId)).data as unknown as LayoutData;
  }

  async shoppingList(roomId: string, ownerId: string, layoutId: string): Promise<ShoppingListDto> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    return shoppingListOf((await this.load(roomId, layoutId)).data as unknown as LayoutData);
  }

  async editObject(roomId: string, ownerId: string, layoutId: string, objectId: string, dto: EditObjectDto): Promise<EditResultDto> {
    const room = await this.rooms.getOwnedRoom(roomId, ownerId);
    const plan = room.floorPlan as unknown as FloorPlan;
    const layout = await this.load(roomId, layoutId);
    const data = layout.data as unknown as LayoutData;
    const warnings: string[] = [];
    try {
      if (dto.listingId) warnings.push(...(await this.swap(data, plan, roomId, ownerId, objectId, dto.listingId)));
      if (dto.x !== undefined || dto.y !== undefined || dto.rotationDeg !== undefined)
        warnings.push(...moveObject(data, plan, objectId, { x: dto.x, y: dto.y, rotationDeg: dto.rotationDeg }));
    } catch (e) {
      if (e instanceof EditError) throw new BadRequestException(e.message);
      throw e;
    }
    return { layout: toLayoutResponse(await this.repo.save(layout.id, data)), warnings: [...new Set(warnings)] };
  }

  async removeObject(roomId: string, ownerId: string, layoutId: string, objectId: string): Promise<EditResultDto> {
    await this.rooms.getOwnedRoom(roomId, ownerId);
    const layout = await this.load(roomId, layoutId);
    const data = layout.data as unknown as LayoutData;
    let removed: string[];
    try {
      removed = removeObject(data, objectId);
    } catch (e) {
      if (e instanceof EditError) throw new BadRequestException(e.message);
      throw e;
    }
    return { layout: toLayoutResponse(await this.repo.save(layout.id, data)), warnings: removed.length > 1 ? [`also removed ${removed.slice(1).join(', ')}`] : [] };
  }

  /** Put a different product of the same type in a placed spot; its real size replaces the old one. */
  private async swap(data: LayoutData, plan: FloorPlan, roomId: string, ownerId: string, objectId: string, listingId: string): Promise<string[]> {
    const o = data.objects.find((x) => x.id === objectId);
    if (!o) throw new EditError(`No object "${objectId}" in this layout`);
    const listing = await this.sourcing.getListing(roomId, listingId);
    if (!listing) throw new NotFoundException('Listing not found in this room');
    if (listing.type !== o.type) throw new EditError(`That product is a ${listing.type}; this spot holds a ${o.type}`);
    const size = listing.size as unknown as Size;
    if (o.mount === 'floor' && !insideRoom({ x: o.position.x, y: o.position.y, w: size.w, d: size.d, rotationDeg: o.rotation_deg }, plan.width, plan.depth))
      throw new EditError(`"${listing.title}" is too big for this spot: move it first or pick a smaller one`);
    o.size = { ...size };
    o.name = listing.title;
    o.product = productOf(listing);
    delete o.suggested;
    data.edits++;
    await this.sourcing.setPicked(roomId, ownerId, listing.id, true);
    return overlapWarnings(data, o);
  }

  private async load(roomId: string, layoutId: string): Promise<Layout> {
    const layout = await this.repo.findInRoom(layoutId, roomId);
    if (!layout) throw new NotFoundException('Layout not found');
    return layout;
  }
}

function productOf(l: Listing): PlacedProduct {
  return { listingId: l.id, title: l.title, url: l.url, source: l.source as ListingSource, price: l.price, currency: l.currency, imageUrl: l.imageUrl };
}

function attach(o: PlacedObject, index: ListingIndex, suggestedIds: Set<string>, specIds: Set<string>): PlacedObject {
  const listing = index.get(o.id);
  if (listing) return { ...o, product: productOf(listing) };
  if (suggestedIds.has(o.id)) return { ...o, suggested: true };
  // extras the engine added to fill empty floor (a pouf, a plant) are also things to buy
  if (!specIds.has(o.id) && SHOPPABLE_LAYERS.includes(o.layer) && o.mount === 'floor') return { ...o, suggested: true };
  return o;
}
