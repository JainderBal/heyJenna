import { z } from 'zod';
import { WALL_TREATMENTS, LEG_STYLES, ARM_STYLES, METAL_FINISHES, FABRICS, PATTERN_MOTIFS, FOCAL_POINTS, RUG_TYPES, RUG_SHAPES, WINDOW_TREATMENTS, ART_ARRANGEMENTS, ART_CONTENTS, PLANT_KINDS, LIGHT_LAYERS, FIXTURE_STYLES, ERA_HINTS, DIAL_DEFAULTS } from './style-dial-meta';
export * from './style-dial-meta';

/**
 * The style dials from docs/style-dials.md (section 3). A style is a point in dial space,
 * not a named preset. Continuous dials run 0..1 (left end of the doc's range → right end);
 * categorical dials are enums. Every dial has a default, so `StyleDials.parse({})` is a
 * complete, neutral profile. `colour_roles` (dial A1) is `StyleProfile.palette` and is not repeated here.
 */
const unit = z.number().min(0).max(1);

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
