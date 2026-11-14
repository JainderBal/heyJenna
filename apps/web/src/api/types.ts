/**
 * Response shapes of the API. The request schemas live in @hey-jenna/contracts; the response DTOs
 * live in apps/api (not exported), so they are mirrored here by hand. Keep them in sync with
 * apps/api/src/modules/<feature>/dto/*-response.dto.ts.
 */
import type {
  ChatResponse,
  FloorPlan,
  FurnitureType,
  ImportBoardRequest,
  ImportBoardResponse,
  ImportedPin,
  ListingSource,
  PinterestBoard,
  PinterestPin,
  PinRef,
  Size,
  StyleProfile,
} from '@hey-jenna/contracts';

export type { ChatResponse, FloorPlan, FurnitureType, ImportBoardRequest, ImportBoardResponse, ImportedPin, PinterestBoard, PinterestPin, PinRef, StyleProfile };

/** GET /projects, /projects/:id */
export interface Project {
  id: string;
  name: string;
  kind: string | null;
  palette: string[];
  createdAt: string;
  updatedAt: string;
}

/** GET /rooms/:id, /projects/:id/rooms */
export interface Room {
  id: string;
  name: string;
  floorPlan: FloorPlan;
  needs: string[];
  projectId: string | null;
  areaM2: number;
  createdAt: string;
  updatedAt: string;
}

/** POST /projects/:id/floor-plan */
export interface DetectedRoom {
  name: string;
  kind: string;
  confidence: number;
  /** Where the room sits on the plan, metres from the top-left. */
  position: { x: number; y: number };
  floorPlan: FloorPlan;
}
export interface FloorPlanReadResult {
  rooms: DetectedRoom[];
  scaleSource: string;
  warnings: string[];
  imageKey: string;
  /** Only with ?create=1. */
  created?: Room[];
}

/** GET /rooms/:roomId/style */
export interface StyleResponse {
  roomId: string;
  profile: StyleProfile;
  imageCount: number;
  updatedAt: string;
}

/** GET /rooms/:roomId/listings */
export interface Listing {
  id: string;
  type: FurnitureType;
  title: string;
  source: ListingSource;
  url: string;
  imageUrl: string | null;
  price: number | null;
  currency: string;
  condition: string;
  location: string | null;
  size: Size;
  sizeEstimated: boolean;
  colours: string[];
  score: number;
  scoreDetail: Record<string, unknown>;
  picked: boolean;
  modelUrl: string | null;
}

/** POST /rooms/:roomId/listings/search (sync) */
export interface SearchSummary {
  searched: { type: FurnitureType; query: string; found: number; kept: number }[];
  sources: string[];
  skippedSources: string[];
  errors: string[];
  listings: Listing[];
}

/** POST /rooms/:roomId/listings/search?async=1 → 202 */
export interface JobAccepted {
  jobId: string;
  status: string;
}

export interface PlacedProduct {
  listingId: string;
  title: string;
  url: string;
  source: ListingSource;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  modelUrl: string | null;
}

/** One piece in a layout (engine output + the product behind it). Metres, degrees. */
export interface PlacedObject {
  id: string;
  type: string;
  name: string;
  name_full?: string;
  layer: string;
  zone: string;
  mount: string;
  position: { x: number; y: number; z: number };
  rotation_deg: number;
  size: { w: number; d: number; h: number };
  colour?: string;
  colour_role?: string;
  product?: PlacedProduct;
  suggested?: boolean;
  [extra: string]: unknown;
}

export interface ShoppingItem {
  objectId: string;
  type: string;
  title: string;
  url: string | null;
  source: string | null;
  price: number | null;
  currency: string;
  suggested: boolean;
}

export interface ShoppingList {
  items: ShoppingItem[];
  total: number;
  currency: string;
  missing: string[];
}

/** GET /rooms/:roomId/layouts/:layoutId */
export interface Layout {
  id: string;
  roomId: string;
  summary: { pass: number; warn: number; fail: number };
  checks: { rule: string; status: string; detail: string }[];
  dropped: Record<string, unknown>[];
  variant: Record<string, unknown>;
  variantsTried: number;
  objects: PlacedObject[];
  shoppingList: ShoppingList;
  createdAt: string;
  updatedAt: string;
}

/** PATCH /rooms/:roomId/layouts/:layoutId/objects/:objectId */
export interface EditResult {
  layout: Layout;
  warnings: string[];
}

/** GET /rooms/:roomId/renders/:jobId */
export interface RenderJob {
  id: string;
  roomId: string;
  layoutId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  attempts: number;
  /** API paths (no /api prefix) once status is "done". */
  imageUrl: string | null;
  modelUrl: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  seconds: number | null;
}

/** GET /pinterest/boards, /pinterest/boards/:id/pins */
export interface PinterestPage<T> {
  items: T[];
  bookmark: string | null;
}

/** POST /rooms/:roomId/pins/similar */
export interface SimilarPins {
  ranked: { pin: PinRef; distance: number }[];
  /** Pins whose image couldn't be read (apps/api style.service.ts rankPins). */
  unreadable: { id: string; reason: string }[];
}

/** One server-sent event from GET /rooms/:roomId/events. */
export type RoomEventType =
  | 'listings.search.started' | 'listings.search.finished' | 'listings.search.failed'
  | 'layout.generated' | 'layout.object.added' | 'layout.object.moved' | 'layout.object.removed'
  | 'render.queued' | 'render.running' | 'render.done' | 'render.failed'
  | 'job.queued' | 'job.running' | 'job.done' | 'job.failed';

export interface RoomEvent<D = Record<string, unknown>> {
  type: RoomEventType;
  roomId: string;
  at: string;
  data: D;
}
