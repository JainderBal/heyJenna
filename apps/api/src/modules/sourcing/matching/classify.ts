import { FurnitureType } from '@hey-jenna/contracts';

/** Ordered: more specific phrases first ("desk chair" before "desk", "coffee table" before "table"). */
const RULES: [FurnitureType, RegExp][] = [
  ['cat_tree', /\bcat (tree|tower|condo)\b/i],
  ['desk_chair', /\b(office|desk|task|swivel|gaming) chair\b/i],
  ['coffee_table', /\b(coffee|cocktail) table\b/i],
  ['nightstand', /\b(nightstand|night stand|bedside table|bedside cabinet|bedside chest)s?\b/i],
  ['side_table', /\b(side|end|accent|drum|nesting) tables?\b/i],
  ['table_lamp', /\b(table|desk|bedside|mushroom) lamp\b/i],
  ['floor_lamp', /\b(floor|arc|standing|pole|torchiere) lamp\b/i],
  ['ceiling_light', /\b(pendant|chandelier|ceiling light|ceiling lamp)\b/i],
  ['sofa', /\b(sofa|couch|sectional|loveseat|love seat|settee|chesterfield|daybed)\b/i],
  ['bed', /\b(bed frame|bedframe|platform bed|bunk bed|loft bed|bed)\b/i],
  ['armchair', /\b(armchair|arm chair|accent chair|lounge chair|club chair|recliner|rocking chair|egg chair|wingback)\b/i],
  ['pouf', /\b(pouf|pouffe|ottoman|footstool|foot stool)\b/i],
  ['dresser', /\b(dresser|chest of (\d+ )?drawers|drawer chest|tallboy)\b/i],
  ['wardrobe', /\b(wardrobe|armoire|closet system)s?\b/i],
  ['sideboard', /\b(sideboard|credenza|buffet|media console|tv stand|tv unit)\b/i],
  ['bench', /\b(bench|shoe bench|storage bench|entryway bench)(es)?\b/i],
  ['wall_shelf', /\b(wall shelf|wall shelves|picture ledge|floating shelf)\b/i],
  ['mirror', /\bmirror\b/i],
  ['shelf', /\b(bookshelf|bookcase|shelving|etagere|shelf unit|shelf)\b/i],
  ['desk', /\b(desk|writing table)\b/i],
  ['dining_chair', /\b(dining|kitchen|side)? ?chairs?\b/i],
  ['dining_table', /\b(dining|kitchen|extendable|drop-leaf|gateleg|round)? ?tables?\b/i],
  ['rug', /\b(rug|carpet|runner)\b/i],
  // a real plant, not the things that hold one (stands, pots, hangers…), which are checked first below
  ['plant', /\b(plant|monstera|fiddle leaf|ficus|palm|snake plant|pothos)\b/i],
  ['art', /\b(wall art|print|poster|painting|canvas|framed art|artwork|picture)\b/i],
];

/** Plant accessories that mention "plant" but aren't one. */
const PLANT_ACCESSORY = /\b(plant stand|plant pot|pot|planter|plant holder|hanger|saucer|plant clip|watering)\b/i;
const LIVE_OR_FAKE_PLANT = /\b(potted plant|artificial plant|plant with pot|monstera|fiddle leaf|ficus|palm|snake plant|pothos)\b/i;

export function classifyTitle(title: string): FurnitureType | null {
  if (/\bplant\b/i.test(title) && PLANT_ACCESSORY.test(title) && !LIVE_OR_FAKE_PLANT.test(title)) return null;
  for (const [type, re] of RULES) if (re.test(title)) return type;
  return null;
}
