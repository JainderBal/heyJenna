import { FurnitureType, StyleProfile } from '@hey-jenna/contracts';
import { nearestColourName } from '../../style/analysis/colour-names';

const TYPE_WORDS: Record<FurnitureType, string> = {
  sofa: 'sofa', armchair: 'armchair', coffee_table: 'coffee table', side_table: 'side table', shelf: 'bookshelf',
  desk: 'desk', desk_chair: 'desk chair', sideboard: 'sideboard', pouf: 'pouf', cat_tree: 'cat tree', rug: 'rug',
  floor_lamp: 'floor lamp', table_lamp: 'table lamp', ceiling_light: 'pendant light', plant: 'plant', art: 'wall art',
};

/** Pieces big enough that their colour defines the room: add a palette colour word to the search. */
const COLOUR_LED: FurnitureType[] = ['sofa', 'armchair', 'rug', 'pouf'];

/** Moodboard style → what we type into a shop's search box, e.g. "mid century teak rust sofa". */
export function buildQuery(type: FurnitureType, style: StyleProfile): string {
  const words = style.keywords.slice(0, 2);
  if (COLOUR_LED.includes(type)) words.push(nearestColourName(style.palette.secondary[0] ?? style.palette.dominant[0]));
  if (type === 'plant') return 'indoor plant pot';
  return [...words, TYPE_WORDS[type]].join(' ');
}
