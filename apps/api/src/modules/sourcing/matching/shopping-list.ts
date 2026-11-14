import { FloorPlan, FurnitureType, RoomKind, isLivingKind } from '@hey-jenna/contracts';

export interface Slot {
  type: FurnitureType;
  count: number;
  /** The layout engine can't work without this piece. */
  required: boolean;
  why: string;
}

const has = (needs: string[], ...words: string[]) => needs.some((n) => words.some((w) => n.toLowerCase().includes(w)));

/** What to shop for, from the room's kind, its size and what the person said they need. */
export function shoppingList(plan: FloorPlan, needs: string[], kind?: RoomKind | null): Slot[] {
  if (!isLivingKind(kind)) return kindList(kind as RoomKind, plan, needs);
  const area = plan.width * plan.depth;
  const slots: Slot[] = [
    { type: 'sofa', count: 1, required: true, why: 'anchor of the conversation zone' },
    { type: 'coffee_table', count: 1, required: false, why: 'surface within reach of the sofa' },
    { type: 'rug', count: 1, required: false, why: 'ties the seating group together' },
    { type: 'floor_lamp', count: 1, required: false, why: 'warm low light in the evening' },
    { type: 'side_table', count: 1, required: false, why: 'a surface next to every seat' },
    { type: 'plant', count: area > 18 ? 3 : 2, required: false, why: 'life and softness' },
    { type: 'art', count: area > 20 ? 4 : 3, required: false, why: 'walls shouldn\'t be bare: above the sofa, sideboard, desk and on blank stretches' },
    { type: 'mirror', count: 1, required: false, why: 'light and depth, ideally near the way in' },
    { type: 'ceiling_light', count: 1, required: false, why: 'general light' },
  ];
  if (area >= 12) slots.push({ type: 'armchair', count: area > 26 ? 2 : 1, required: false, why: 'extra seat facing the sofa' });
  if (has(needs, 'work', 'desk', 'study', 'office', 'wfh'))
    slots.push(
      { type: 'desk', count: 1, required: false, why: 'works from home' },
      { type: 'desk_chair', count: 1, required: false, why: 'works from home' },
      { type: 'table_lamp', count: 1, required: false, why: 'task light for the desk' },
    );
  if (has(needs, 'read', 'book')) slots.push({ type: 'shelf', count: 1, required: false, why: 'reads: books need a home' });
  if (has(needs, 'work', 'desk', 'study', 'office', 'wfh', 'read', 'book')) slots.push({ type: 'wall_shelf', count: 1, required: false, why: 'a shelf above the desk or reading spot' });
  if (has(needs, 'cat')) slots.push({ type: 'cat_tree', count: 1, required: false, why: 'has a cat' });
  if (has(needs, 'friends', 'guests', 'host', 'entertain')) slots.push({ type: 'pouf', count: 1, required: false, why: 'flexible extra seat for guests' });
  if (area >= 16) slots.push({ type: 'sideboard', count: 1, required: false, why: 'storage along a wall' });
  return slots;
}

const slot = (type: FurnitureType, count: number, why: string, required = false): Slot => ({ type, count, required, why });

/**
 * Bedrooms, dining rooms, kitchens, bathrooms, halls, closets, laundry and balconies: the pieces that room is for,
 * scaled to its size. Small rooms (a 1 m closet) get only what fits; the layout engine leaves out anything that doesn't.
 */
function kindList(kind: RoomKind, plan: FloorPlan, needs: string[]): Slot[] {
  const area = plan.width * plan.depth;
  const short = Math.min(plan.width, plan.depth);
  const light = slot('ceiling_light', 1, 'general light');
  switch (kind) {
    case 'bedroom': {
      const out = [
        slot('bed', 1, 'the room is for sleeping', true),
        slot('nightstand', short >= 2.6 ? 2 : 1, 'a surface each side of the bed'),
        slot('table_lamp', short >= 2.6 ? 2 : 1, 'a reading light on each nightstand'),
        slot('rug', 1, 'soft underfoot getting out of bed'),
        slot('art', 2, 'over the bed and on a blank wall'),
        light,
      ];
      if (area >= 9) out.push(slot('dresser', 1, 'clothes storage'));
      if (area >= 12) out.push(slot('mirror', 1, 'a mirror to dress by'), slot('plant', 1, 'life and softness'));
      if (area >= 15) out.push(slot('armchair', 1, 'a chair to sit and dress or read'));
      if (has(needs, 'work', 'desk', 'study', 'wfh')) out.push(slot('desk', 1, 'works from home'), slot('desk_chair', 1, 'works from home'));
      return out;
    }
    case 'dining': {
      const seats = area >= 14 ? 6 : area >= 8 ? 4 : 2;
      const out = [
        slot('dining_table', 1, 'the room is for eating together', true),
        slot('dining_chair', seats, `seats for ${seats}`),
        slot('ceiling_light', 1, 'a pendant over the table'),
        slot('art', 2, 'walls shouldn\'t be bare'),
        slot('plant', 1, 'life and softness'),
      ];
      if (area >= 10) out.push(slot('rug', 1, 'under the table and pulled-out chairs'));
      if (area >= 12) out.push(slot('sideboard', 1, 'storage and a serving surface'));
      return out;
    }
    case 'kitchen': {
      const out = [light, slot('art', 1, 'one piece on a free wall'), slot('plant', 1, 'herbs or a plant by the window'), slot('rug', 1, 'a runner along the counter')];
      if (area >= 9 && short >= 2.6) out.unshift(slot('dining_table', 1, 'a small table to eat at'), slot('dining_chair', 2, 'two seats at the table'));
      return out;
    }
    case 'bathroom':
      return [light, slot('mirror', 1, 'over the sink'), slot('shelf', 1, 'towels and toiletries'), slot('rug', 1, 'a bath mat'), slot('plant', 1, 'a plant that likes steam'), slot('art', 1, 'one small piece')];
    case 'hallway':
    case 'entry': {
      const out = [light, slot('mirror', 1, 'a last look on the way out'), slot('rug', 1, 'a runner'), slot('art', 1, 'walls shouldn\'t be bare')];
      if (short >= 1.3) out.unshift(slot('bench', 1, 'a seat to put shoes on'));
      if (short >= 1.6) out.push(slot('plant', 1, 'a welcome'));
      return out;
    }
    case 'closet':
    case 'storage':
      return [light, slot('shelf', short >= 1.2 ? 2 : 1, 'shelving for storage'), ...(area >= 3 ? [slot('wardrobe', 1, 'hanging space')] : []), ...(area >= 4 ? [slot('mirror', 1, 'a full-length mirror')] : [])];
    case 'laundry':
      return [light, slot('shelf', 1, 'detergent and baskets'), slot('plant', 1, 'something living'), slot('art', 1, 'one small piece')];
    case 'balcony':
      return [slot('armchair', area >= 5 ? 2 : 1, 'somewhere to sit outside'), slot('side_table', 1, 'a cup of coffee'), slot('plant', area >= 5 ? 3 : 2, 'plants love a balcony'), slot('rug', 1, 'an outdoor rug')];
    default:
      return [light, slot('art', 1, 'walls shouldn\'t be bare'), slot('plant', 1, 'life and softness')];
  }
}
