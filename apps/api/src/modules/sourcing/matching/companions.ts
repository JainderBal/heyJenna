import { FloorPlan, Size } from '@hey-jenna/contracts';
import { Listing } from '@prisma/client';
import { slotWeight } from './budget';
import { Slot } from './shopping-list';

/** Bonus for a product we can show as its real 3D model. */
const MODEL_BONUS = 0.08;

const sizeOf = (l: Listing) => l.size as unknown as Size;

/**
 * How well one candidate suits the pieces already chosen (designer rules of thumb, metres):
 * coffee table ≈ ⅔ of the sofa, rug ≥ sofa + 30 cm and leaves floor around it,
 * armchair no bigger than the sofa, side table near arm height. Returns a score adjustment.
 */
export function companionFit(l: Listing, sofa: Listing | undefined, plan: FloorPlan): number {
  const s = sizeOf(l);
  let fit = 0;
  if (sofa) {
    const sofaSize = sizeOf(sofa);
    if (l.type === 'coffee_table') fit -= Math.abs(s.w / sofaSize.w - 0.62) * 1.2;
    if (l.type === 'rug') {
      if (s.w < sofaSize.w) fit -= 0.45;
      else if (s.w < sofaSize.w + 0.3) fit -= 0.15;
    }
    if (l.type === 'armchair') {
      if (s.h > sofaSize.h * 1.25) fit -= 0.15; // towers over the sofa
      if (s.w > sofaSize.w * 0.6) fit -= 0.2; // a "chair" half the sofa's size is a loveseat
    }
    if (l.type === 'side_table') fit -= Math.min(0.3, Math.abs(s.h - Math.max(0.5, sofaSize.h * 0.75)) * 1.5);
  }
  // a lone tall, narrow bookcase reads as a pillar; low-and-wide shelving looks intentional
  if (l.type === 'shelf' && s.h > 1.6 && s.w < 0.6) fit -= 0.3;
  if (l.type === 'shelf' && s.h <= 1.5 && s.w >= 0.75) fit += 0.08;
  if (l.type === 'rug') {
    const free = Math.min(plan.width, plan.depth) - s.d;
    if (free < 1.2) fit -= 0.3; // a rug almost wall-to-wall
  }
  return fit;
}

const priceOf = (l: Listing): number | null => (typeof l.price === 'number' ? l.price : null);

const byRank = (base: (l: Listing) => number, sofa: Listing | undefined, plan: FloorPlan) => (a: Listing, b: Listing) =>
  base(b) + companionFit(b, sofa, plan) - (base(a) + companionFit(a, sofa, plan));

/**
 * Fill the rest of a slot from what's left of the room cap.
 * Priced pieces that fit come first. An unpriced piece is used only when nothing priced fits, and it
 * does not spend the cap. A required piece with nothing that fits takes the cheapest one anyway.
 */
function takeWithin(rest: Listing[], need: number, remaining: number, required: boolean, rank: (a: Listing, b: Listing) => number): Listing[] {
  const priced = rest.filter((l) => priceOf(l) != null).sort(rank);
  const unpriced = rest.filter((l) => priceOf(l) == null).sort(rank);
  const out: Listing[] = [];
  let left = remaining;
  while (out.length < need) {
    const fit = priced.filter((l) => !out.includes(l) && (priceOf(l) as number) <= left);
    if (fit.length && left > 0) {
      const next = fit[0];
      out.push(next);
      left -= priceOf(next) as number;
      continue;
    }
    if (left > 0 && unpriced.length) {
      out.push(unpriced.shift()!);
      continue;
    }
    break;
  }
  if (required && out.length < need) {
    const cheapest = priced.filter((l) => !out.includes(l)).sort((a, b) => (priceOf(a) as number) - (priceOf(b) as number))[0];
    const fallback = cheapest ?? unpriced[0];
    if (fallback) out.push(fallback);
  }
  return out.slice(0, need);
}

/** The final pick per slot: picked by the person first, then best score + 3D model bonus + suits the sofa. */
export function chooseSet(slots: Slot[], byType: Map<string, Listing[]>, plan: FloorPlan, cap?: number): { slot: Slot; listings: Listing[] }[] {
  const base = (l: Listing) => l.score + (l.modelUrl ? MODEL_BONUS : 0);
  const pick = (slot: Slot, sofa?: Listing) => {
    const all = byType.get(slot.type) ?? [];
    const picked = all.filter((l) => l.picked);
    const rest = all.filter((l) => !l.picked).sort(byRank(base, sofa, plan));
    return [...picked, ...rest].slice(0, slot.count);
  };
  if (cap == null) {
    const sofaSlot = slots.find((s) => s.type === 'sofa');
    const sofa = sofaSlot ? pick(sofaSlot)[0] : undefined;
    return slots.map((slot) => ({ slot, listings: slot.type === 'sofa' ? (sofa ? [sofa] : []) : pick(slot, sofa) }));
  }

  let remaining = cap;
  const chosen = new Map<string, Listing[]>();
  for (const slot of slots) {
    const picked = (byType.get(slot.type) ?? []).filter((l) => l.picked).slice(0, slot.count);
    for (const l of picked) {
      const price = priceOf(l);
      if (price != null) remaining -= price;
    }
    chosen.set(slot.type, picked);
  }

  const fill = (slot: Slot, sofa?: Listing) => {
    const have = chosen.get(slot.type) ?? [];
    const need = slot.count - have.length;
    if (need <= 0) return have[0];
    const rest = (byType.get(slot.type) ?? []).filter((l) => !l.picked);
    const added = takeWithin(rest, need, remaining, slot.required, byRank(base, sofa, plan));
    for (const l of added) {
      const price = priceOf(l);
      if (price != null) remaining -= price;
    }
    const listings = [...have, ...added];
    chosen.set(slot.type, listings);
    return listings[0];
  };

  const sofa = fill(slots.find((s) => s.type === 'sofa') ?? { type: 'sofa', count: 0, required: false, why: '' });
  const others = slots
    .filter((s) => s.type !== 'sofa')
    .map((slot, i) => ({ slot, i }))
    .sort((a, b) => slotWeight(b.slot.type) - slotWeight(a.slot.type) || a.i - b.i);
  for (const { slot } of others) fill(slot, sofa);
  return slots.map((slot) => ({ slot, listings: chosen.get(slot.type) ?? [] }));
}
