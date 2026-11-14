import { Dropped } from '../engine/repair';
import { PlacedObject } from '../layout.types';

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

export interface ShoppingListDto {
  items: ShoppingItem[];
  total: number;
  currency: string;
  /** Pieces with no product yet (search more, or paste a link). */
  missing: string[];
}

export interface LayoutResponseDto {
  id: string;
  roomId: string;
  summary: { pass: number; warn: number; fail: number };
  checks: { rule: string; status: string; detail: string }[];
  dropped: Dropped[];
  /** Which design option won, and how many were compared. */
  variant: Record<string, unknown>;
  variantsTried: number;
  objects: PlacedObject[];
  shoppingList: ShoppingListDto;
  createdAt: string;
  updatedAt: string;
}

export interface EditResultDto {
  layout: LayoutResponseDto;
  warnings: string[];
}
