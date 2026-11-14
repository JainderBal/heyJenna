import { FurnitureType, StyleDialValues } from '@hey-jenna/contracts';

/**
 * Style dials → words shops use, per furniture type. Feeds an extra IKEA search
 * ("boucle sofa", "jute rug", "walnut coffee table", "paper pendant light") and the style score.
 */
const UPHOLSTERED: FurnitureType[] = ['sofa', 'armchair', 'pouf', 'desk_chair'];
const CASEGOODS: FurnitureType[] = ['coffee_table', 'side_table', 'shelf', 'desk', 'sideboard', 'wall_shelf'];
const LAMPS: FurnitureType[] = ['floor_lamp', 'table_lamp', 'ceiling_light'];

const FABRIC_WORD: Record<StyleDialValues['fabric'][number], string> = {
  linen: 'linen', cotton: 'cotton', boucle: 'boucle', velvet: 'velvet', leather: 'leather', wool: 'wool',
  corduroy: 'corduroy', shag: 'shaggy', sheepskin: 'sheepskin',
};
const RUG_WORD: Partial<Record<StyleDialValues['rug_type'], string>> = {
  flatweave_solid: 'flatwoven', jute_sisal: 'jute', shag: 'high pile', persian_vintage: 'vintage',
  geometric: 'pattern', kilim_handmade: 'handmade', sheepskin: 'sheepskin',
};
const METAL_WORD: Partial<Record<StyleDialValues['metal_finish'], string>> = {
  black_iron: 'black metal', chrome: 'chrome', brushed_steel: 'stainless steel', brass: 'brass', bronze_copper: 'copper', white_powder: 'white metal',
};
const FIXTURE_WORD: Partial<Record<StyleDialValues['fixture_style'], string>> = {
  paper_lantern: 'paper', globe_opal: 'globe', mushroom: 'mushroom', arc: 'arc', cage_edison: 'cage',
  pleated_fringed: 'pleated', brass_geometric: 'brass', minimal_tube: 'led',
};

export function woodWord(tone: number): string {
  return tone < 0.3 ? 'birch' : tone < 0.65 ? 'oak' : 'walnut';
}

/** The one material/style word that best narrows a search for this type, or undefined. */
export function materialWord(type: FurnitureType, d: StyleDialValues | undefined): string | undefined {
  if (!d) return undefined;
  if (UPHOLSTERED.includes(type)) return FABRIC_WORD[d.fabric[0]];
  if (type === 'rug') return RUG_WORD[d.rug_type];
  if (LAMPS.includes(type)) return FIXTURE_WORD[d.fixture_style];
  if (CASEGOODS.includes(type)) return d.metal_amount > 0.5 && d.metal_amount > d.wood_amount ? METAL_WORD[d.metal_finish] : woodWord(d.wood_tone);
  if (type === 'plant') return d.plant_kind.includes('cacti_succulents') ? 'succulent' : d.plant_kind.includes('palms') ? 'palm' : undefined;
  return undefined;
}

/** Every dial word that should count as "on style" in a listing of this type. */
export function dialWords(type: FurnitureType, d: StyleDialValues | undefined): string[] {
  if (!d) return [];
  const words = new Set<string>();
  const main = materialWord(type, d);
  if (main) words.add(main);
  if (UPHOLSTERED.includes(type)) d.fabric.slice(1).forEach((f) => words.add(FABRIC_WORD[f]));
  if (d.rawness > 0.6) ['reclaimed', 'solid wood', 'raw'].forEach((w) => words.add(w));
  if (d.natural_materials > 0.75) ['rattan', 'jute', 'linen', 'bamboo', 'cane'].forEach((w) => words.add(w));
  if (d.metal_amount > 0.5) { const m = METAL_WORD[d.metal_finish]; if (m) words.add(m); }
  return [...words];
}

/** Decorative-detail words, for the `ornament` dial. */
export const ORNATE = /\b(carved|ornate|tufted|fringe[d]?|scalloped|gilded|tassel)/i;

const SEATING: FurnitureType[] = ['sofa', 'armchair'];
const ROUNDABLE: FurnitureType[] = ['sofa', 'armchair', 'pouf', 'coffee_table', 'side_table', 'desk', 'sideboard', 'mirror', 'floor_lamp'];
const LEGGED: FurnitureType[] = ['sofa', 'armchair', 'coffee_table', 'side_table', 'desk', 'sideboard'];
const LOW_TALL: FurnitureType[] = ['sofa', 'armchair', 'coffee_table', 'sideboard', 'shelf'];
const BULKY: FurnitureType[] = ['sofa', 'armchair', 'pouf', 'coffee_table', 'side_table', 'desk', 'sideboard', 'shelf'];

const LEG_WORD: Partial<Record<StyleDialValues['leg_style'], string>> = {
  tapered_splayed: 'tapered legs', straight_square: 'square legs', turned: 'turned legs', cabriole: 'cabriole legs',
  hairpin: 'hairpin legs', tubular_chrome: 'chrome legs', sled_frame: 'sled base', block: 'block legs', bun: 'bun feet', plinth: 'plinth',
};
const ARM_WORD: Record<StyleDialValues['arm_style'], string> = {
  none: 'armless', track: 'track arm', slope: 'sloped arm', rolled: 'rolled arm', flared: 'flared arm', rounded_wrap: 'curved arm', wood_frame: 'wood frame',
};

/**
 * Furniture-shape dials (curvature, line_direction, leg_lift, leg_style, mass, arm_style, modularity) → shop words,
 * most telling first. The first one feeds the extra IKEA search; all of them are a small scoring tiebreaker.
 */
export function shapeWords(type: FurnitureType, d: StyleDialValues | undefined): string[] {
  if (!d) return [];
  const w: string[] = [];
  if (type === 'sofa' && d.modularity > 0.65) w.push('modular', 'sectional');
  if (type === 'shelf' && d.modularity > 0.65) w.push('modular');
  if (SEATING.includes(type)) w.push(ARM_WORD[d.arm_style]);
  if (LEGGED.includes(type) && LEG_WORD[d.leg_style]) w.push(LEG_WORD[d.leg_style]!);
  if (ROUNDABLE.includes(type) && d.curvature > 0.7) w.push('rounded', 'curved', 'arched');
  if (LEGGED.includes(type) && d.leg_lift > 0.7) w.push('legs');
  if (BULKY.includes(type)) { if (d.mass > 0.7) w.push('chunky', 'thick'); else if (d.mass < 0.25) w.push('slim', 'slender', 'thin'); }
  if (LOW_TALL.includes(type)) { if (d.line_direction > 0.75) w.push('low'); else if (d.line_direction < 0.25) w.push('tall'); }
  return [...new Set(w)];
}
