import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { FloorPlan, ListingSource, Size } from '@hey-jenna/contracts';
import { Layout, Listing } from '@prisma/client';
import { RoomEventsService } from '../../common/events/events.service';
import { RoomsService } from '../rooms/rooms.service';
import { SourcingService } from '../sourcing/sourcing.service';
import { StyleService } from '../style/style.service';
import { EditObjectDto } from './dto/move-object.dto';
import { EditResultDto, LayoutResponseDto, ShoppingListDto } from './dto/layout-response.dto';
import { EditError, moveObject, overlapWarnings, removeObject } from './editing/edits';
import { insideRoom } from './editing/geometry';
import { defaultRotation, findFloorSpot, FLOOR_LAYER, floorClashes, floorWarnings, isFloorType } from './editing/floor';
import { defaultHeight, findWallSpot, hiddenBehind, isWallType, wallClashes, wallLength, wallPose } from './editing/walls';
import { AddObjectDto } from './dto/add-object.dto';
import { Wall } from '@hey-jenna/contracts';
import { EngineFailedError } from './engine/python-layout.engine';
import { LAYOUT_ENGINE, LayoutEngine } from './engine/layout-engine';
import { solveBestVariant } from './engine/variants';
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
    private readonly events: RoomEventsService,
  ) {}

  async generate(roomId: string, ownerId: string): Promise<LayoutResponseDto> {
    const room = await this.rooms.getOwnedRoom(roomId, ownerId);
    const plan = room.floorPlan as unknown as FloorPlan;
    const style = await this.style.getProfile(roomId);
    const chosen = await this.sourcing.chooseForRoom(room);
    const { spec, index } = buildEngineSpec(room.name, plan, room.needs, style, chosen);

    let solved;
    try {
      solved = await solveBestVariant(this.engine, spec);
    } catch (e) {
      if (e instanceof EngineFailedError) throw new UnprocessableEntityException(`Couldn't lay out this room: ${e.message}`);
      throw e;
    }
    const suggestedIds = new Set(spec.furniture.filter((f) => f.suggested).map((f) => f.id));
    const specIds = new Set(spec.furniture.map((f) => f.id));
    const objects = solved.result.objects.map((o) => attach(o as PlacedObject, index, suggestedIds, specIds));
    const data: LayoutData = { ...solved.result, objects, dropped: solved.dropped, edits: 0, variant: solved.variant, variantsTried: solved.tried };
    const saved = await this.repo.create(roomId, data);
    this.events.publish(roomId, 'layout.generated', { layoutId: saved.id, summary: saved.summary });
    return toLayoutResponse(saved);
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
      if (dto.wall !== undefined || dto.position !== undefined || dto.height !== undefined)
        warnings.push(...this.moveOnWall(data, plan, objectId, dto));
      if (dto.x !== undefined || dto.y !== undefined || dto.rotationDeg !== undefined)
        warnings.push(...moveObject(data, plan, objectId, { x: dto.x, y: dto.y, rotationDeg: dto.rotationDeg }));
    } catch (e) {
      if (e instanceof EditError) throw new BadRequestException(e.message);
      throw e;
    }
    const saved = await this.repo.save(layout.id, data);
    this.events.publish(roomId, 'layout.object.moved', { layoutId, objectId, ...(dto.listingId ? { listingId: dto.listingId } : {}) });
    return { layout: toLayoutResponse(saved), warnings: [...new Set(warnings)] };
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
    const saved = await this.repo.save(layout.id, data);
    this.events.publish(roomId, 'layout.object.removed', { layoutId, objectId, removed });
    return { layout: toLayoutResponse(saved), warnings: removed.length > 1 ? [`also removed ${removed.slice(1).join(', ')}`] : [] };
  }

  /**
   * Add one of the room's products to the layout: where the person says, or the best free spot.
   * Wall pieces hang on a visible wall; floor pieces stand clear of doors, windows and other furniture, next to their natural partner.
   */
  async addObject(roomId: string, ownerId: string, layoutId: string, dto: AddObjectDto): Promise<EditResultDto> {
    const room = await this.rooms.getOwnedRoom(roomId, ownerId);
    const plan = room.floorPlan as unknown as FloorPlan;
    const layout = await this.load(roomId, layoutId);
    const data = layout.data as unknown as LayoutData;
    const found = await this.sourcing.getListing(roomId, dto.listingId);
    if (!found) throw new NotFoundException('Listing not found in this room');
    const listing = await this.sourcing.ensureDetails(found); // real size from its 3D model before choosing a spot
    let added: { o: PlacedObject; warnings: string[] };
    if (isWallType(listing.type)) {
      if (dto.x !== undefined || dto.rotationDeg !== undefined) throw new BadRequestException(`A ${listing.type} hangs on a wall: give wall/position/height, not x/y`);
      added = this.addToWall(data, plan, listing, dto);
    } else if (isFloorType(listing.type)) {
      if (dto.wall !== undefined || dto.position !== undefined || dto.height !== undefined)
        throw new BadRequestException(`A ${listing.type} stands on the floor: give x/y/rotationDeg, not wall/position/height`);
      added = this.addToFloor(data, plan, listing, dto);
    } else throw new BadRequestException(`A ${listing.type} can't be added by hand (it goes on a surface or the ceiling)`);
    data.objects.push(added.o);
    data.edits++;
    await this.sourcing.setPicked(roomId, ownerId, listing.id, true);
    const saved = await this.repo.save(layout.id, data);
    this.events.publish(roomId, 'layout.object.added', { layoutId, objectId: added.o.id, listingId: listing.id });
    return { layout: toLayoutResponse(saved), warnings: added.warnings };
  }

  /** Hang a wall piece where the person says, or on the best free stretch of a visible wall. */
  private addToWall(data: LayoutData, plan: FloorPlan, listing: Listing, dto: AddObjectDto): { o: PlacedObject; warnings: string[] } {
    const size = listing.size as unknown as Size;
    const openWalls = ((data.room as { open_walls_in_render?: Wall[] } | undefined)?.open_walls_in_render ?? ['front', 'right']) as Wall[];
    const visible = (['back', 'left', 'right', 'front'] as Wall[]).filter((w) => !openWalls.includes(w));

    let wall = dto.wall, u = dto.position, z = dto.height;
    if (wall === undefined || u === undefined) {
      const spot = findWallSpot(plan, data, size, wall ? [wall] : visible);
      if (!spot) throw new ConflictException(`No free wall space for "${listing.title}" (${size.w} m wide)${wall ? ` on the ${wall} wall` : ''}`);
      wall = spot.wall; u = spot.u; z ??= spot.z;
    }
    z ??= defaultHeight(size);
    const problems = wallClashes(plan, data, wall, u, z, size);
    if (problems.length) throw new BadRequestException({ message: `Can't hang it there`, problems });

    const pose = wallPose(plan, wall, u, size.d);
    const o: PlacedObject = {
      id: nextId(data, listing.type), type: listing.type, name: listing.title, layer: 'art', zone: wall, mount: 'wall',
      position: { x: pose.x, y: pose.y, z }, rotation_deg: pose.rotation, size: { ...size },
      wall, arrangement: 'single', colour_role: 'accent', product: productOf(listing), added_by: 'person',
    };
    const warnings = hiddenBehind(data, plan, wall, u, z, size).map((id) => `partly hidden behind ${id}`);
    if (openWalls.includes(wall)) warnings.push(`the ${wall} wall is cut away in the picture, so it won't show in renders`);
    return { o, warnings };
  }

  /**
   * Stand a floor piece where the person says (refused if it sticks out, blocks a door or a window with a tall piece;
   * warnings if it overlaps furniture), or on the best free spot next to its natural partner.
   */
  private addToFloor(data: LayoutData, plan: FloorPlan, listing: Listing, dto: AddObjectDto): { o: PlacedObject; warnings: string[] } {
    const piece = { type: listing.type, size: listing.size as unknown as Size };
    let pose: { x: number; y: number; rotationDeg: number }, near: string | undefined;
    if (dto.x !== undefined && dto.y !== undefined) {
      pose = { x: dto.x, y: dto.y, rotationDeg: dto.rotationDeg ?? defaultRotation(plan, dto.x, dto.y) };
    } else {
      const spot = findFloorSpot(plan, data, piece);
      if (!spot) throw new ConflictException(`No free floor space for "${listing.title}" (${piece.size.w} x ${piece.size.d} m) clear of doors, windows and furniture`);
      pose = { x: spot.x, y: spot.y, rotationDeg: dto.rotationDeg ?? spot.rotationDeg };
      near = spot.near;
    }
    pose.rotationDeg = ((pose.rotationDeg % 360) + 360) % 360;
    const problems = floorClashes(plan, data, piece, pose);
    if (problems.length) throw new BadRequestException({ message: `Can't put it there`, problems });
    const id = nextId(data, listing.type);
    const o: PlacedObject = {
      id, type: listing.type, name: listing.title, layer: FLOOR_LAYER[listing.type],
      zone: (near && data.objects.find((x) => x.id === near)?.zone) || 'open', mount: 'floor',
      position: { x: pose.x, y: pose.y, z: 0 }, rotation_deg: pose.rotationDeg, size: { ...piece.size },
      ...(near ? { near } : {}), product: productOf(listing), added_by: 'person',
    };
    return { o, warnings: floorWarnings(data, piece, pose, id) };
  }

  /** Slide, raise/lower or re-hang a wall piece; refuses spots over windows, doors or other pieces. */
  private moveOnWall(data: LayoutData, plan: FloorPlan, objectId: string, dto: EditObjectDto): string[] {
    const o = data.objects.find((x) => x.id === objectId);
    if (!o) throw new EditError(`No object "${objectId}" in this layout`);
    if (!isWallType(o.type)) throw new EditError(`"${objectId}" isn't a wall piece: move it with x/y instead`);
    const wall = (dto.wall ?? o.wall) as Wall;
    const current = o.wall === 'back' || o.wall === 'front' ? o.position.x : o.position.y;
    const u = dto.position ?? (dto.wall && dto.wall !== o.wall ? wallLength(plan, wall) / 2 : current);
    const z = dto.height ?? o.position.z;
    const problems = wallClashes(plan, data, wall, u, z, o.size, o.id);
    if (problems.length) throw new EditError(`Can't hang it there: ${problems.join('; ')}`);
    const pose = wallPose(plan, wall, u, o.size.d);
    o.position = { x: pose.x, y: pose.y, z };
    o.rotation_deg = pose.rotation;
    o.wall = wall;
    o.zone = wall;
    data.edits++;
    return hiddenBehind(data, plan, wall, u, z, o.size).filter((id) => id !== o.id).map((id) => `partly hidden behind ${id}`);
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

/** Next free id for a type: armchair_1, armchair_2… */
function nextId(data: LayoutData, type: string): string {
  return `${type}_${1 + Math.max(0, ...data.objects.filter((o) => o.type === type).map((o) => Number(o.id.split('_').pop()) || 0))}`;
}

function productOf(l: Listing): PlacedProduct {
  return { listingId: l.id, title: l.title, url: l.url, source: l.source as ListingSource, price: l.price, currency: l.currency, imageUrl: l.imageUrl, modelUrl: l.modelUrl || null };
}

function attach(o: PlacedObject, index: ListingIndex, suggestedIds: Set<string>, specIds: Set<string>): PlacedObject {
  const listing = index.get(o.id);
  if (listing) return { ...o, product: productOf(listing) };
  if (suggestedIds.has(o.id)) return { ...o, suggested: true };
  // extras the engine added to fill empty floor (a pouf, a plant) are also things to buy
  if (!specIds.has(o.id) && SHOPPABLE_LAYERS.includes(o.layer) && o.mount === 'floor') return { ...o, suggested: true };
  return o;
}
