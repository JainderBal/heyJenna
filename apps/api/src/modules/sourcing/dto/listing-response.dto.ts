import { FurnitureType, ListingSource, Size } from '@hey-jenna/contracts';
import { ScoreDetail } from '../matching/scoring';

export interface ListingResponseDto {
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
  scoreDetail: ScoreDetail;
  picked: boolean;
}

export interface SearchSummaryDto {
  searched: { type: FurnitureType; query: string; found: number; kept: number }[];
  sources: string[];
  skippedSources: string[];
  errors: string[];
  listings: ListingResponseDto[];
}
