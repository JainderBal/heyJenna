import { FloorPlan, Size } from '@hey-jenna/contracts';
import { Listing } from '@prisma/client';
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
  if (l.type === 'rug') {
    const free = Math.min(plan.width, plan.depth) - s.d;
    if (free < 1.2) fit -= 0.3; // a rug almost wall-to-wall
  }
  return fit;
}

/** The final pick per slot: picked by the person first, then best score + 3D model bonus + suits the sofa. */
export function chooseSet(slots: Slot[], byType: Map<string, Listing[]>, plan: FloorPlan): { slot: Slot; listings: Listing[] }[] {
  const base = (l: Listing) => l.score + (l.modelUrl ? MODEL_BONUS : 0);
  const pick = (slot: Slot, sofa?: Listing) => {
    const all = byType.get(slot.type) ?? [];
    const picked = all.filter((l) => l.picked);
    const rest = all.filter((l) => !l.picked).sort((a, b) => base(b) + companionFit(b, sofa, plan) - (base(a) + companionFit(a, sofa, plan)));
    return [...picked, ...rest].slice(0, slot.count);
  };
  const sofaSlot = slots.find((s) => s.type === 'sofa');
  const sofa = sofaSlot ? pick(sofaSlot)[0] : undefined;
  return slots.map((slot) => ({ slot, listings: slot.type === 'sofa' ? (sofa ? [sofa] : []) : pick(slot, sofa) }));
}
