import { ListingSource } from '@hey-jenna/contracts';
import { EngineObject, EngineResult } from './engine/layout-engine';
import { Dropped } from './engine/repair';

/** The product behind a placed object (what the person can buy). */
export interface PlacedProduct {
  listingId: string;
  title: string;
  url: string;
  source: ListingSource;
  price: number | null;
  currency: string;
  imageUrl: string | null;
}

export interface PlacedObject extends EngineObject {
  product?: PlacedProduct;
  /** No product found or picked yet: a stand-in with a typical size. */
  suggested?: boolean;
}

/** What we store per layout (the layouts.data column). */
export interface LayoutData extends Omit<EngineResult, 'objects'> {
  objects: PlacedObject[];
  dropped: Dropped[];
  edits: number;
}

/** Layers a person may move around (walls, windows, zones and wall art stay put). */
export const MOVABLE_LAYERS = ['furniture', 'soft_furnishings', 'lighting', 'plants', 'decor'];
