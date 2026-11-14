import { FloorPlan, FurnitureType, StyleProfile } from '@hey-jenna/contracts';
import { Prisma } from '@prisma/client';
import { RawListing } from '../adapters/source.adapter';
import { NewListing } from '../listings.repository';
import { classifyTitle } from './classify';
import { sizeFor } from './dimensions';
import { coloursIn, priceFit, scoreListing } from './scoring';

/**
 * Raw search result → a listing ready to save: real size if the text has it, colours, score.
 * Returns null when the result is clearly a different kind of furniture.
 */
export function buildListing(raw: RawListing, type: FurnitureType, style: StyleProfile | null, plan: FloorPlan, priceTarget?: number): NewListing | null {
  const seen = classifyTitle(raw.title);
  if (seen && seen !== type) return null; // searched "sofa", got "sofa table"
  const text = `${raw.title} ${raw.description ?? ''}`;
  const { size, estimated } = sizeFor(text, type);
  const detail = style
    ? scoreListing({ type, text, size, sizeEstimated: estimated, price: raw.price, colourHexes: raw.colourHexes, priceTarget }, style, plan)
    : { style: 0.5, colour: 0.5, fit: 0.5, price: priceFit(raw.price, priceTarget), total: 0.5, matchedWords: [] };
  return {
    source: raw.source,
    externalId: raw.externalId.slice(0, 500),
    url: raw.url,
    title: raw.title.slice(0, 300),
    type,
    price: raw.price,
    currency: raw.currency,
    imageUrl: raw.imageUrl,
    condition: raw.condition,
    location: raw.location,
    size: size as unknown as Prisma.InputJsonValue,
    sizeEstimated: estimated,
    colours: raw.colourHexes?.length ? raw.colourHexes : coloursIn(text),
    score: detail.total,
    scoreDetail: detail as unknown as Prisma.InputJsonValue,
  };
}
