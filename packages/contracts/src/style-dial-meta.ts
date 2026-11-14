/**
 * The style dials as plain data, with no zod: option lists, defaults and the editing metadata (sections,
 * labels, ranges) the studio's Style tab is built from. `style-dials.ts` builds the zod schema from the same
 * lists and re-exports everything here; the web app imports this file alone (`@hey-jenna/contracts/dial-meta`)
 * so its bundle doesn't pull in zod. Ranges must match `StyleDialsShape` (checked in `dials.spec.ts`).
 */
import type { StyleDialValues } from './style-dials';

export const WALL_TREATMENTS = ['plain_paint', 'colour_drenched', 'two_tone', 'limewash_plaster', 'wallpaper', 'panelling', 'exposed_brick', 'concrete', 'tile'] as const;
export const LEG_STYLES = ['tapered_splayed', 'straight_square', 'turned', 'cabriole', 'hairpin', 'tubular_chrome', 'sled_frame', 'block', 'bun', 'plinth', 'none'] as const;
export const ARM_STYLES = ['none', 'track', 'slope', 'rolled', 'flared', 'rounded_wrap', 'wood_frame'] as const;
export const METAL_FINISHES = ['none', 'black_iron', 'chrome', 'brushed_steel', 'brass', 'bronze_copper', 'white_powder'] as const;
export const FABRICS = ['linen', 'cotton', 'boucle', 'velvet', 'leather', 'wool', 'corduroy', 'shag', 'sheepskin'] as const;
export const PATTERN_MOTIFS = ['stripe', 'check', 'geometric', 'organic_abstract', 'floral_botanical', 'handmade_global', 'damask_traditional', 'none'] as const;
export const FOCAL_POINTS = ['auto', 'window_view', 'fireplace', 'feature_wall', 'art', 'tv', 'statement_furniture', 'shelving'] as const;
export const RUG_TYPES = ['none', 'flatweave_solid', 'jute_sisal', 'shag', 'persian_vintage', 'geometric', 'kilim_handmade', 'sheepskin'] as const;
export const RUG_SHAPES = ['rect', 'round', 'organic'] as const;
export const WINDOW_TREATMENTS = ['none', 'sheer', 'linen_drape', 'heavy_drape', 'roman_blind', 'venetian', 'shutters', 'bead_or_fringe'] as const;
export const ART_ARRANGEMENTS = ['single_statement', 'pair', 'grid', 'salon', 'ledge_leaning'] as const;
export const ART_CONTENTS = ['abstract_colour', 'line_drawing', 'botanical', 'photography', 'graphic_poster', 'landscape', 'classical_portrait', 'textile_hanging', 'mirror'] as const;
export const PLANT_KINDS = ['sculptural_single', 'trailing', 'palms', 'cacti_succulents', 'branches_ikebana', 'bushy_mixed'] as const;
export const LIGHT_LAYERS = ['ambient_ceiling', 'pendant', 'floor_lamp', 'table_lamp', 'wall_sconce', 'picture_light', 'led_strip', 'candles'] as const;
export const FIXTURE_STYLES = ['paper_lantern', 'globe_opal', 'mushroom', 'arc', 'cage_edison', 'pleated_fringed', 'brass_geometric', 'minimal_tube'] as const;
export const ERA_HINTS = ['1930s', '1950s', '1960s', '1970s', '1980s', 'contemporary'] as const;


/** Neutral, slightly warm-modern defaults (between Scandi and Mid-century in section 4 of the doc). */
export const DIAL_DEFAULTS: StyleDialValues = {
  palette_temperature: 0.55, palette_value: 0.65, palette_saturation: 0.35, value_contrast: 0.5, hue_spread: 0.35,
  accent_share: 0.1, wall_treatment: 'plain_paint',
  curvature: 0.45, line_direction: 0.6, leg_lift: 0.6, leg_style: 'straight_square', mass: 0.45, arm_style: 'track',
  ornament: 0.15, modularity: 0.2,
  wood_tone: 0.45, wood_amount: 0.45, metal_finish: 'black_iron', metal_amount: 0.25, sheen: 0.25, texture: 0.45,
  rawness: 0.25, natural_materials: 0.65, fabric: ['wool'],
  pattern_amount: 0.3, pattern_scale: 0.5, pattern_motif: ['none'],
  symmetry: 0.4, repetition: 0.5, statement_strength: 0.5, eclecticism: 0.3, furniture_scale: 0.5,
  negative_space: 0.55, furniture_float: 0.5, grouping: 0.6, focal_point: 'auto', zone_definition: 0.3, architectural_detail: 0.3,
  styling_density: 0.5, styling_order: 0.6, textile_layers: 0.45, books_and_objects: 0.4,
  rug_type: 'flatweave_solid', rug_shape: 'rect', window_treatment: 'linen_drape', art_amount: 0.4,
  art_arrangement: 'single_statement', art_content: 'abstract_colour', plant_amount: 0.4, plant_kind: ['sculptural_single'],
  light_warmth_k: 2700, light_level: 0.6, light_drama: 0.5, light_layers: ['ambient_ceiling', 'floor_lamp', 'table_lamp'],
  fixture_style: 'globe_opal', era_hints: [],
};

export type DialKey = keyof StyleDialValues;

/** How a dial is edited: a 0..1 (or other numeric) slider, one choice, or a set of choices (`ranked`: first one wins). */
export type DialMeta =
  | { key: DialKey; label: string; kind: 'number'; min: number; max: number; step: number; lo: string; hi: string; unit?: string }
  | { key: DialKey; label: string; kind: 'enum'; options: readonly string[] }
  | { key: DialKey; label: string; kind: 'set'; options: readonly string[]; min: number; ranked?: boolean };

export interface DialSection {
  id: string;
  title: string;
  dials: DialMeta[];
}

const n = (key: DialKey, label: string, lo: string, hi: string): DialMeta => ({ key, label, kind: 'number', min: 0, max: 1, step: 0.01, lo, hi });
const e = (key: DialKey, label: string, options: readonly string[]): DialMeta => ({ key, label, kind: 'enum', options });
const s = (key: DialKey, label: string, options: readonly string[], min = 1, ranked = false): DialMeta => ({ key, label, kind: 'set', options, min, ...(ranked ? { ranked } : {}) });

/** Every dial in `StyleDialsShape`, grouped as in section 3 of docs/style-dials.md (`colour_roles` is the palette). */
export const DIAL_SECTIONS: DialSection[] = [
  {
    id: 'A', title: 'Colour', dials: [
      n('palette_temperature', 'Temperature', 'cool', 'warm'),
      n('palette_value', 'Lightness', 'dark, moody', 'light, airy'),
      n('palette_saturation', 'Saturation', 'muted', 'vivid'),
      n('value_contrast', 'Contrast', 'tonal', 'graphic'),
      n('hue_spread', 'Hue spread', 'monochrome', 'rainbow'),
      { key: 'accent_share', label: 'Accent share', kind: 'number', min: 0.05, max: 0.25, step: 0.01, lo: '5 %', hi: '25 %' },
      e('wall_treatment', 'Walls', WALL_TREATMENTS),
    ],
  },
  {
    id: 'B', title: 'Line and form', dials: [
      n('curvature', 'Curvature', 'square', 'organic'),
      n('line_direction', 'Line direction', 'tall, vertical', 'low, horizontal'),
      n('leg_lift', 'Leg lift', 'on the floor', 'high, slim legs'),
      e('leg_style', 'Legs', LEG_STYLES),
      n('mass', 'Mass', 'slender', 'chunky'),
      e('arm_style', 'Arms', ARM_STYLES),
      n('ornament', 'Ornament', 'plain', 'carved, gilded'),
      n('modularity', 'Modularity', 'single pieces', 'modular blocks'),
    ],
  },
  {
    id: 'C', title: 'Materials and texture', dials: [
      n('wood_tone', 'Wood tone', 'pale', 'dark'),
      n('wood_amount', 'Wood amount', 'none', 'everywhere'),
      e('metal_finish', 'Metal', METAL_FINISHES),
      n('metal_amount', 'Metal amount', 'hidden', 'everywhere'),
      n('sheen', 'Sheen', 'matte', 'high gloss'),
      n('texture', 'Texture', 'sleek', 'rough'),
      n('rawness', 'Rawness', 'pristine', 'weathered'),
      n('natural_materials', 'Natural materials', 'synthetic', 'natural'),
      s('fabric', 'Fabrics (first = main)', FABRICS, 1, true),
    ],
  },
  {
    id: 'D', title: 'Pattern', dials: [
      n('pattern_amount', 'Pattern amount', 'all solids', 'pattern on pattern'),
      n('pattern_scale', 'Pattern scale', 'fine', 'bold'),
      s('pattern_motif', 'Motifs', PATTERN_MOTIFS),
    ],
  },
  {
    id: 'E', title: 'Composition', dials: [
      n('symmetry', 'Symmetry', 'asymmetric', 'mirrored'),
      n('repetition', 'Repetition', 'all different', 'sets and pairs'),
      n('statement_strength', 'Statement piece', 'quiet', 'one bold piece'),
      n('eclecticism', 'Eclecticism', 'one family', 'collected mix'),
      n('furniture_scale', 'Furniture scale', 'apartment-scale', 'oversized'),
    ],
  },
  {
    id: 'F', title: 'Space and layout', dials: [
      n('negative_space', 'Negative space', 'full', 'gallery-like'),
      n('furniture_float', 'Float', 'against the walls', 'floated groups'),
      n('grouping', 'Grouping', 'spread evenly', 'tight clusters'),
      e('focal_point', 'Focal point', FOCAL_POINTS),
      n('zone_definition', 'Zones', 'one open space', 'separate zones'),
      n('architectural_detail', 'Architectural detail', 'plain box', 'mouldings, beams'),
    ],
  },
  {
    id: 'G', title: 'Density and styling', dials: [
      n('styling_density', 'Styling density', 'bare', 'layered'),
      n('styling_order', 'Styling order', 'lived-in', 'composed'),
      n('textile_layers', 'Textile layers', 'none', 'rug on rug'),
      n('books_and_objects', 'Books and objects', 'hidden', 'full shelves'),
    ],
  },
  {
    id: 'H', title: 'Soft furnishings, art and plants', dials: [
      e('rug_type', 'Rug', RUG_TYPES),
      e('rug_shape', 'Rug shape', RUG_SHAPES),
      e('window_treatment', 'Windows', WINDOW_TREATMENTS),
      n('art_amount', 'Art amount', 'bare walls', 'walls covered'),
      e('art_arrangement', 'Art hung as', ART_ARRANGEMENTS),
      e('art_content', 'Art shows', ART_CONTENTS),
      n('plant_amount', 'Plants', 'none', 'jungle'),
      s('plant_kind', 'Plant kinds', PLANT_KINDS),
    ],
  },
  {
    id: 'I', title: 'Lighting', dials: [
      { key: 'light_warmth_k', label: 'Light warmth', kind: 'number', min: 2200, max: 4000, step: 100, lo: 'candle', hi: 'neutral', unit: 'K' },
      n('light_level', 'Light level', 'dim, moody', 'bright, airy'),
      n('light_drama', 'Light drama', 'flat, even', 'pools of light'),
      s('light_layers', 'Light layers', LIGHT_LAYERS),
      e('fixture_style', 'Fixtures', FIXTURE_STYLES),
    ],
  },
  { id: 'era', title: 'Era (not a dial)', dials: [s('era_hints', 'Era hints', ERA_HINTS, 0)] },
];
