import { FurnitureType, StyleProfile } from '@hey-jenna/contracts';
import { nearestColourName } from '../../style/analysis/colour-names';

const TYPE_WORDS: Record<FurnitureType, string> = {
  sofa: 'sofa', armchair: 'armchair', coffee_table: 'coffee table', side_table: 'side table', shelf: 'bookshelf',
  desk: 'desk', desk_chair: 'desk chair', sideboard: 'sideboard', pouf: 'pouf', cat_tree: 'cat tree', rug: 'rug',
  floor_lamp: 'floor lamp', table_lamp: 'table lamp', ceiling_light: 'pendant light', plant: 'plant', art: 'wall art',
};

/** Pieces big enough that their colour defines the room: add a palette colour word to the search. */
const COLOUR_LED: FurnitureType[] = ['sofa', 'armchair', 'rug', 'pouf'];

/** Shop-friendly colour words: "navy" finds little, "blue" finds a lot. */
const SIMPLE_COLOUR: Record<string, string> = {
  navy: 'blue', 'light blue': 'blue', teal: 'blue', walnut: 'brown', teak: 'brown', oak: 'beige', tan: 'beige',
  cream: 'white', charcoal: 'grey', olive: 'green', sage: 'green', rust: 'orange', terracotta: 'orange',
  mustard: 'yellow', burgundy: 'red', blush: 'pink', lilac: 'purple', chrome: 'grey', gold: 'yellow',
};

/** The parts of a search: the board's signature colour, its top style word, the furniture words. */
export function queryParts(type: FurnitureType, style: StyleProfile) {
  const signature = style.palette.secondary.find((h) => !['black', 'white', 'grey', 'beige', 'charcoal', 'cream'].includes(nearestColourName(h)))
    ?? style.palette.secondary[0] ?? style.palette.dominant[0];
  const name = nearestColourName(signature);
  return { colour: SIMPLE_COLOUR[name] ?? name, keyword: style.keywords[0] ?? '', typeText: TYPE_WORDS[type] };
}

/** Moodboard style → what we type into a shop's search box, e.g. "mid century teak rust sofa". */
export function buildQuery(type: FurnitureType, style: StyleProfile): string {
  const words = style.keywords.slice(0, 2);
  if (COLOUR_LED.includes(type)) words.push(nearestColourName(style.palette.secondary[0] ?? style.palette.dominant[0]));
  if (type === 'plant') return 'indoor plant pot';
  return [...words, TYPE_WORDS[type]].join(' ');
}
