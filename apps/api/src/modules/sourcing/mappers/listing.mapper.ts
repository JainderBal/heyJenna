import { Listing } from '@prisma/client';
import { FurnitureType, ListingSource, Size } from '@hey-jenna/contracts';
import { ListingResponseDto } from '../dto/listing-response.dto';
import { ScoreDetail } from '../matching/scoring';

export function toListingResponse(l: Listing): ListingResponseDto {
  return {
    id: l.id,
    type: l.type as FurnitureType,
    title: l.title,
    source: l.source as ListingSource,
    url: l.url,
    imageUrl: l.imageUrl,
    price: l.price,
    currency: l.currency,
    condition: l.condition,
    location: l.location,
    size: l.size as unknown as Size,
    sizeEstimated: l.sizeEstimated,
    colours: l.colours,
    score: l.score,
    scoreDetail: l.scoreDetail as unknown as ScoreDetail,
    picked: l.picked,
  };
}
