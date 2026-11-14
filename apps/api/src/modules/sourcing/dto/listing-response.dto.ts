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
  /** 3D model of the product (IKEA), when the product page has one. */
  modelUrl: string | null;
}

export interface SearchSummaryDto {
  searched: { type: FurnitureType; query: string; found: number; kept: number }[];
  sources: string[];
  skippedSources: string[];
  errors: string[];
  listings: ListingResponseDto[];
}
