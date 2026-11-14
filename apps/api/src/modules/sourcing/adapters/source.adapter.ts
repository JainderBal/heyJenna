import { FurnitureType, ListingSource } from '@hey-jenna/contracts';

/** One product as a source returns it, before we work out size, colours and score. */
export interface RawListing {
  source: ListingSource;
  externalId: string;
  url: string;
  title: string;
  description?: string;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  condition: 'new' | 'used' | 'unknown';
  location: string | null;
}

export interface SourceQuery {
  type: FurnitureType;
  /** e.g. "mid century teak coffee table" */
  text: string;
  limit: number;
}

/** Every product source (eBay, web search, mock…) plugs in through this shape. */
export interface SourceAdapter {
  readonly name: string;
  /** False when its API keys aren't set; the service then skips it. */
  enabled(): boolean;
  search(q: SourceQuery): Promise<RawListing[]>;
}

export const SOURCE_ADAPTERS = Symbol('SOURCE_ADAPTERS');

/** Finds a price like "$120", "CA $1,250.00" or "120 $" in text. */
export function findPrice(text: string): number | null {
  const m = /(?:CA\s?)?\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)|(\d+(?:[.,]\d{2})?)\s?\$/.exec(text);
  if (!m) return null;
  const v = Number((m[1] ?? m[2]).replace(/,(?=\d{3})/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}
