import { z } from 'zod';

/**
 * The style dials from docs/style-dials.md (section 3). A style is a point in dial space,
 * not a named preset. Continuous dials run 0..1 (left end of the doc's range → right end);
 * categorical dials are enums. Every dial has a default, so `StyleDials.parse({})` is a
 * complete, neutral profile. `colour_roles` (dial A1) is `StyleProfile.palette` and is not repeated here.
 */
const unit = z.number().min(0).max(1);

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

const list = <T extends readonly [string, ...string[]]>(values: T) => z.array(z.enum(values)).min(1).max(values.length);

/** The dial shapes with no defaults: used for PATCH (every key optional). */
export const StyleDialsShape = z.object({
  // A. Colour
  palette_temperature: unit,         // 0 cool … 1 warm
  palette_value: unit,               // 0 dark, moody … 1 light, airy
  palette_saturation: unit,          // 0 muted … 1 vivid
  value_contrast: unit,              // 0 tonal … 1 graphic
  hue_spread: unit,                  // 0 monochrome … 1 rainbow
  accent_share: z.number().min(0.05).max(0.25),
  wall_treatment: z.enum(WALL_TREATMENTS),
  // B. Line and form
  curvature: unit,                   // 0 square … 1 organic
  line_direction: unit,              // 0 tall, vertical … 1 low, horizontal
  leg_lift: unit,                    // 0 skirted, on the floor … 1 high slim legs
  leg_style: z.enum(LEG_STYLES),
  mass: unit,                        // 0 slender … 1 chunky
  arm_style: z.enum(ARM_STYLES),
  ornament: unit,                    // 0 plain … 1 carved, gilded
  modularity: unit,                  // 0 single pieces … 1 modular blocks
  // C. Materials and texture
  wood_tone: unit,                   // 0 pale … 1 dark
  wood_amount: unit,
  metal_finish: z.enum(METAL_FINISHES),
  metal_amount: unit,
  sheen: unit,                       // 0 matte … 1 high gloss
  texture: unit,                     // 0 sleek … 1 rough
  rawness: unit,                     // 0 pristine … 1 weathered
  natural_materials: unit,           // 0 synthetic … 1 natural
  fabric: list(FABRICS),             // ranked, first = main upholstery
  // D. Pattern
  pattern_amount: unit,
  pattern_scale: unit,               // 0 fine … 1 bold
  pattern_motif: list(PATTERN_MOTIFS),
  // E. Composition
  symmetry: unit,
  repetition: unit,
  statement_strength: unit,
  eclecticism: unit,
  furniture_scale: unit,             // 0 apartment-scale … 1 oversized
  // F. Space and layout
  negative_space: unit,              // 0 full … 1 gallery-like
  furniture_float: unit,             // 0 against the walls … 1 floated groups
  grouping: unit,                    // 0 spread evenly … 1 tight clusters
  focal_point: z.enum(FOCAL_POINTS), // 'auto' = let the engine choose
  zone_definition: unit,
  architectural_detail: unit,
  // G. Density and styling
  styling_density: unit,             // 0 bare … 1 layered
  styling_order: unit,               // 0 lived-in … 1 composed
  textile_layers: unit,
  books_and_objects: unit,
  // H. Soft furnishings, art and plants
  rug_type: z.enum(RUG_TYPES),
  rug_shape: z.enum(RUG_SHAPES),
  window_treatment: z.enum(WINDOW_TREATMENTS),
  art_amount: unit,
  art_arrangement: z.enum(ART_ARRANGEMENTS),
  art_content: z.enum(ART_CONTENTS),
  plant_amount: unit,
  plant_kind: list(PLANT_KINDS),
  // I. Lighting
  light_warmth_k: z.number().int().min(2200).max(4000),
  light_level: unit,
  light_drama: unit,
  light_layers: list(LIGHT_LAYERS),
  fixture_style: z.enum(FIXTURE_STYLES),
  // not a dial: optional era bias for motif and prop choice
  era_hints: z.array(z.enum(ERA_HINTS)).max(ERA_HINTS.length),
});
export type StyleDialValues = z.infer<typeof StyleDialsShape>;

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

/** Partial dials (e.g. a PATCH body or an old stored profile). Unknown keys are rejected. */
export const StyleDialsPatch = StyleDialsShape.partial().strict();
export type StyleDialsPatch = z.infer<typeof StyleDialsPatch>;

/** Full dials: any missing dial is filled from DIAL_DEFAULTS. */
export const StyleDials = StyleDialsShape.partial()
  .strip()
  .transform((d): StyleDialValues => ({ ...DIAL_DEFAULTS, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) }));
export type StyleDials = z.infer<typeof StyleDials>;

/** Dials counted as in the doc: every key except the two list extras (fabric, era_hints), plus colour_roles (= palette). */
export const DIAL_COUNT = Object.keys(DIAL_DEFAULTS).length - 2 + 1;

/** styling_density dial → the engine's three bands (doc section 6: < .4 sparse, < .7 balanced). */
export function densityBand(v: number): 'sparse' | 'balanced' | 'layered' {
  return v < 0.4 ? 'sparse' : v < 0.7 ? 'balanced' : 'layered';
}
