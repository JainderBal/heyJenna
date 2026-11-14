import { FloorPlan, FurnitureType } from '@hey-jenna/contracts';

export interface Slot {
  type: FurnitureType;
  count: number;
  /** The layout engine can't work without this piece. */
  required: boolean;
  why: string;
}

const has = (needs: string[], ...words: string[]) => needs.some((n) => words.some((w) => n.toLowerCase().includes(w)));

/** What to shop for, from the room size and what the person said they need. */
export function shoppingList(plan: FloorPlan, needs: string[]): Slot[] {
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
