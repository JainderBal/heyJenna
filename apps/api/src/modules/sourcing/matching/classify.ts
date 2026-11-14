import { FurnitureType } from '@hey-jenna/contracts';

/** Ordered: more specific phrases first ("desk chair" before "desk", "coffee table" before "table"). */
const RULES: [FurnitureType, RegExp][] = [
  ['cat_tree', /\bcat (tree|tower|condo)\b/i],
  ['desk_chair', /\b(office|desk|task|swivel|gaming) chair\b/i],
  ['coffee_table', /\b(coffee|cocktail) table\b/i],
  ['side_table', /\b(side|end|accent|drum|nesting) tables?\b|\bnightstand\b/i],
  ['table_lamp', /\b(table|desk|bedside|mushroom) lamp\b/i],
  ['floor_lamp', /\b(floor|arc|standing|pole|torchiere) lamp\b/i],
  ['ceiling_light', /\b(pendant|chandelier|ceiling light|ceiling lamp)\b/i],
  ['sofa', /\b(sofa|couch|sectional|loveseat|love seat|settee|chesterfield|daybed)\b/i],
  ['armchair', /\b(armchair|arm chair|accent chair|lounge chair|club chair|recliner|rocking chair|egg chair|wingback)\b/i],
  ['pouf', /\b(pouf|pouffe|ottoman|footstool|foot stool)\b/i],
  ['sideboard', /\b(sideboard|credenza|buffet|media console|tv stand|tv unit|dresser)\b/i],
  ['shelf', /\b(bookshelf|bookcase|shelving|etagere|shelf unit|shelf)\b/i],
  ['desk', /\b(desk|writing table)\b/i],
  ['rug', /\b(rug|carpet|runner)\b/i],
  ['plant', /\b(plant|monstera|fiddle leaf|ficus|palm|snake plant|pothos)\b/i],
  ['art', /\b(wall art|print|poster|painting|canvas|framed art|artwork)\b/i],
];

export function classifyTitle(title: string): FurnitureType | null {
  for (const [type, re] of RULES) if (re.test(title)) return type;
  return null;
}
