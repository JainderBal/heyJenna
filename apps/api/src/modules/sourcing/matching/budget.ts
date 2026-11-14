import { FurnitureType } from '@hey-jenna/contracts';
import { Slot } from './shopping-list';

/** A listing this far above its slot target is dropped from search. Layout still enforces the room cap. */
export const PRICE_HEADROOM = 1.75;

/**
 * How much of a room's money each kind of piece usually takes. Renormalized over the slots
 * the room actually has. Plants and art then split their share across how many are wanted.
 */
const SLOT_WEIGHT: Record<FurnitureType, number> = {
  sofa: 28,
  armchair: 12,
  coffee_table: 8,
  rug: 10,
  sideboard: 8,
  desk: 8,
  desk_chair: 5,
  shelf: 5,
  floor_lamp: 4,
  ceiling_light: 4,
  side_table: 3,
  table_lamp: 2,
  plant: 2,
  art: 4,
  mirror: 3,
  pouf: 2,
  cat_tree: 3,
  wall_shelf: 2,
};

export const slotWeight = (type: string): number => SLOT_WEIGHT[type as FurnitureType] ?? 1;

export interface RoomMoney {
  id: string;
  /** Floor area in square metres. */
  area: number;
  /** Latest layout total. Ignored for the room being furnished. */
  spent: number;
}

export interface BudgetContext {
  budgetCad: number;
  roomShare: number;
  cap: number;
  spentElsewhere: number;
}

export interface RoomBudget extends BudgetContext {
  /** Per-piece target in CAD, for the slots this room is shopping for. */
  targets: Map<FurnitureType, number>;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function planArea(plan: { width?: unknown; depth?: unknown } | null | undefined): number {
  if (!plan || typeof plan.width !== 'number' || typeof plan.depth !== 'number') return 0;
  return plan.width * plan.depth;
}

/** Sum of product prices on a stored layout. Stand-ins contribute nothing. */
export function layoutSpent(data: unknown): number {
  const objects = (data as { objects?: { product?: { price?: unknown } | null }[] } | null)?.objects;
  if (!Array.isArray(objects)) return 0;
  const total = objects.reduce((s, o) => s + (typeof o?.product?.price === 'number' ? o.product.price : 0), 0);
  return cents(total);
}

/** This room's fraction of the home budget, by floor area. */
export function shareOf(budgetCad: number, roomId: string, rooms: RoomMoney[]): number {
  const total = rooms.reduce((s, r) => s + Math.max(0, r.area), 0);
  const mine = rooms.find((r) => r.id === roomId);
  const area = Math.max(0, mine?.area ?? 0);
  if (total > 0) return budgetCad * (area / total);
  return rooms.length ? budgetCad / rooms.length : budgetCad;
}

/** Per-piece target. A slot's weight is split across its count. */
export function slotTargets(cap: number, slots: Slot[]): Map<FurnitureType, number> {
  const weights = slots.map((s) => slotWeight(s.type));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const targets = new Map<FurnitureType, number>();
  slots.forEach((s, i) => {
    const slotMoney = cap * (weights[i] / sum);
    targets.set(s.type, cents(slotMoney / Math.max(1, s.count)));
  });
  return targets;
}

/**
 * Null budget means no cap. Otherwise the room may spend its area share, and no more than
 * what the other rooms have not already committed. Its own last layout is not subtracted.
 */
export function budgetForRoom(budgetCad: number | null | undefined, roomId: string, rooms: RoomMoney[], slots: Slot[]): RoomBudget | null {
  if (budgetCad == null || !(budgetCad > 0)) return null;
  const roomShare = cents(shareOf(budgetCad, roomId, rooms));
  const spentElsewhere = cents(rooms.filter((r) => r.id !== roomId).reduce((s, r) => s + Math.max(0, r.spent), 0));
  const cap = cents(Math.min(roomShare, Math.max(0, budgetCad - spentElsewhere)));
  return { budgetCad, roomShare, cap, spentElsewhere, targets: slotTargets(cap, slots) };
}

/** Known price above the slot's headroom. Missing prices stay in the search. */
export function overSlotCeiling(price: number | null | undefined, target: number | undefined): boolean {
  if (target == null || price == null) return false;
  return price > target * PRICE_HEADROOM + 0.001;
}

/** One paragraph for Jenna's system prompt. Empty when the home has no budget. */
export function budgetPrompt(b: BudgetContext | null): string {
  if (!b) return '';
  const n = (v: number) => Math.round(v).toLocaleString('en-CA');
  return `The home budget is ${n(b.budgetCad)} CAD. This room's share is ${n(b.roomShare)} CAD, by floor area. Other rooms already total ${n(b.spentElsewhere)} CAD. Stay inside this room's share. Do not pass the home budget as maxPrice.`;
}
