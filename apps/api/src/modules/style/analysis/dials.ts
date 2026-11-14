import { DIAL_DEFAULTS, FABRICS, StyleDialsPatch, StyleDialValues } from '@hey-jenna/contracts';
import { chroma } from './colour';
import { PaletteCluster, PaletteResult } from './palette';
import { Vibe } from './vibe';

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Moodboard → the 55 style dials, without AI.
 * 1. Start from DIAL_DEFAULTS.
 * 2. Lay a style point from docs/style-dials.md section 4 on top, picked by the vibe
 *    (retro ≈ between Mid-century and 1970s, minimal ≈ Scandi, garden ≈ desaturated Boho, …).
 * 3. Overwrite the dials the palette maths can measure (colour, wood) and a few rules
 *    that follow from the vibe (density, fabric, light warmth).
 */
export function deriveDials(p: PaletteResult, v: Vibe): StyleDialValues {
  return deriveDialsWithOrigin(p, v).dials;
}

/** deriveDials plus which dials were read from the images (steps 3) rather than taken from the preset or the defaults. */
export function deriveDialsWithOrigin(p: PaletteResult, v: Vibe): { dials: StyleDialValues; measured: (keyof StyleDialValues)[] } {
  const preset = VIBE_POINTS[v.name] ?? FAMILY_POINTS[v.shapeFamily] ?? {};
  const read = { ...measuredDials(p), ...ruleDials(p, v, preset) };
  return { dials: { ...DIAL_DEFAULTS, ...preset, ...read }, measured: Object.keys(read) as (keyof StyleDialValues)[] };
}

/** Dials measured straight from the k-means palette. */
export function measuredDials(p: PaletteResult): StyleDialsPatch {
  const cs = p.clusters.filter((c) => c.share >= 0.02);
  const out: StyleDialsPatch = {
    palette_temperature: round((p.warmth + 1) / 2),
    palette_value: round(p.lightness),
    palette_saturation: round(p.saturation),
  };
  if (cs.length) {
    const ls = cs.map((c) => c.lab[0]);
    out.value_contrast = round(clamp((Math.max(...ls) - Math.min(...ls)) / 80));
    out.hue_spread = hueSpread(cs);
    const accentShare = p.clusters.filter((c) => p.accent.includes(c.hex)).reduce((s, c) => s + c.share, 0);
    out.accent_share = round(clamp(accentShare, 0.05, 0.25));
    const woods = cs.filter(isWoodLike);
    const woodShare = woods.reduce((s, c) => s + c.share, 0);
    if (woodShare >= 0.05) {
      const L = woods.reduce((s, c) => s + c.lab[0] * c.share, 0) / woodShare;
      out.wood_tone = round(clamp((80 - L) / 55)); // L 80 pale birch → 0, L 25 walnut → 1
      out.wood_amount = round(clamp(woodShare * 2));
    }
  }
  return out;
}

/** Distinct hue families outside the neutrals: 0 → 0, 1 → .1, 2 → .3, 3 → .5, 4 → .7, 5+ → .9+. */
function hueSpread(cs: PaletteCluster[]): number {
  const sectors = new Set(
    cs.filter((c) => chroma(c.lab) > 18).map((c) => Math.floor(((Math.atan2(c.lab[2], c.lab[1]) * 180) / Math.PI + 360) % 360 / 45)),
  );
  return sectors.size === 0 ? 0 : round(clamp(0.1 + (sectors.size - 1) * 0.2));
}

/** Browns/tans/honeys: orange-yellow hue, moderate chroma. */
function isWoodLike(c: PaletteCluster): boolean {
  const [L, a, b] = c.lab;
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const ch = chroma(c.lab);
  return hue >= 40 && hue <= 85 && ch >= 12 && ch <= 55 && L >= 20 && L <= 82;
}

/** The old sparse/balanced/layered choice → its styling_density dial value. */
export const DENSITY_VALUE = { sparse: 0.3, balanced: 0.55, layered: 0.8 } as const;

/** Dials that follow from the vibe and the measured colours. */
function ruleDials(p: PaletteResult, v: Vibe, preset: StyleDialsPatch): StyleDialsPatch {
  const out: StyleDialsPatch = { styling_density: DENSITY_VALUE[v.stylingDensity] };
  const fabric = FABRICS.find((f) => v.materials.fabric?.toLowerCase().includes(f));
  if (fabric) out.fabric = [fabric, ...(preset.fabric ?? []).filter((f) => f !== fabric)];
  // warm boards get warmer lamps; cool, light boards get neutral-warm (doc: default 2700 K)
  out.light_warmth_k = p.warmth > 0.4 ? 2400 : p.warmth < -0.2 ? 3000 : (preset.light_warmth_k ?? 2700);
  // dark rooms read moody: light level follows the palette value (doc: read with palette_value)
  out.light_level = round(clamp(0.5 * (preset.light_level ?? DIAL_DEFAULTS.light_level) + 0.5 * p.lightness));
  if (v.name === 'garden' || v.shapeFamily === 'garden') out.plant_amount = Math.max(preset.plant_amount ?? 0, 0.85);
  return out;
}

/** Style points from section 4 of docs/style-dials.md (only the dials the doc gives numbers for). */
const MID_CENTURY: StyleDialsPatch = {
  curvature: 0.5, line_direction: 0.7, leg_lift: 0.8, leg_style: 'tapered_splayed', mass: 0.3, ornament: 0.1, modularity: 0.2,
  wood_tone: 0.7, metal_finish: 'brass', metal_amount: 0.3, sheen: 0.3, texture: 0.3, rawness: 0.1, natural_materials: 0.6,
  fabric: ['wool', 'leather'], pattern_amount: 0.3, pattern_motif: ['geometric', 'organic_abstract'],
  symmetry: 0.3, statement_strength: 0.6, eclecticism: 0.3, negative_space: 0.6, furniture_float: 0.5, grouping: 0.6,
  styling_order: 0.7, textile_layers: 0.3, rug_type: 'geometric', art_arrangement: 'single_statement', art_content: 'abstract_colour',
  plant_kind: ['sculptural_single'], light_drama: 0.5, fixture_style: 'globe_opal', era_hints: ['1950s', '1960s'],
};
const SEVENTIES: StyleDialsPatch = {
  curvature: 0.75, line_direction: 0.9, leg_lift: 0.2, leg_style: 'plinth', mass: 0.8, ornament: 0.2, modularity: 0.9,
  wood_tone: 0.6, metal_finish: 'chrome', metal_amount: 0.4, sheen: 0.4, texture: 0.85, rawness: 0.2, natural_materials: 0.5,
  fabric: ['boucle', 'corduroy', 'shag'], pattern_amount: 0.5, pattern_motif: ['geometric', 'floral_botanical'],
  symmetry: 0.3, statement_strength: 0.7, eclecticism: 0.4, negative_space: 0.4, furniture_float: 0.85, grouping: 0.9,
  styling_order: 0.4, textile_layers: 0.7, rug_type: 'shag', art_arrangement: 'grid', art_content: 'graphic_poster',
  plant_kind: ['trailing'], light_warmth_k: 2400, light_drama: 0.5, fixture_style: 'mushroom', era_hints: ['1970s'],
};

/** Halfway between two points: numbers averaged, categories from `b` (the louder one). */
function between(a: StyleDialsPatch, b: StyleDialsPatch, hueSpread?: number): StyleDialsPatch {
  const out: Record<string, unknown> = { ...a, ...b };
  for (const k of Object.keys(a) as (keyof StyleDialsPatch)[]) {
    const x = a[k], y = b[k];
    if (typeof x === 'number' && typeof y === 'number') out[k] = round((x + y) / 2);
  }
  if (hueSpread != null) out.hue_spread = hueSpread;
  return out as StyleDialsPatch;
}

const SCANDI: StyleDialsPatch = {
  curvature: 0.4, line_direction: 0.5, leg_lift: 0.7, leg_style: 'tapered_splayed', mass: 0.3, ornament: 0.05, modularity: 0.2,
  wood_tone: 0.15, metal_finish: 'black_iron', metal_amount: 0.1, sheen: 0.1, texture: 0.45, rawness: 0.2, natural_materials: 0.8,
  fabric: ['wool', 'sheepskin'], pattern_amount: 0.15, pattern_motif: ['stripe', 'geometric'],
  symmetry: 0.4, statement_strength: 0.3, eclecticism: 0.15, negative_space: 0.75, furniture_float: 0.4, grouping: 0.5,
  styling_order: 0.7, textile_layers: 0.5, rug_type: 'flatweave_solid', art_arrangement: 'pair', art_content: 'line_drawing',
  plant_amount: 0.3, plant_kind: ['bushy_mixed'], light_drama: 0.3, fixture_style: 'paper_lantern', era_hints: ['contemporary'],
};
const BOHO_GARDEN: StyleDialsPatch = {
  curvature: 0.7, line_direction: 0.75, leg_lift: 0.35, leg_style: 'turned', mass: 0.5, ornament: 0.5, modularity: 0.4,
  wood_tone: 0.4, metal_finish: 'brass', metal_amount: 0.2, sheen: 0.1, texture: 0.9, rawness: 0.5, natural_materials: 0.9,
  fabric: ['linen', 'cotton'], pattern_amount: 0.7, pattern_motif: ['handmade_global', 'floral_botanical'],
  symmetry: 0.1, statement_strength: 0.4, eclecticism: 0.8, negative_space: 0.25, furniture_float: 0.4, grouping: 0.6,
  styling_order: 0.3, textile_layers: 0.9, rug_type: 'jute_sisal', art_arrangement: 'salon', art_content: 'botanical',
  plant_amount: 0.85, plant_kind: ['trailing', 'palms'], light_warmth_k: 2400, light_drama: 0.4, fixture_style: 'pleated_fringed',
};
/** Dark, rich boards: between Art Deco and Maximalist. */
const MOODY: StyleDialsPatch = {
  curvature: 0.55, line_direction: 0.4, leg_lift: 0.5, leg_style: 'block', mass: 0.6, ornament: 0.7, modularity: 0.2,
  wood_tone: 0.85, metal_finish: 'brass', metal_amount: 0.55, sheen: 0.7, texture: 0.45, rawness: 0.1, natural_materials: 0.4,
  fabric: ['velvet'], pattern_amount: 0.6, pattern_motif: ['geometric'], symmetry: 0.65, statement_strength: 0.65, eclecticism: 0.5,
  negative_space: 0.3, furniture_float: 0.55, grouping: 0.7, styling_order: 0.7, textile_layers: 0.6, rug_type: 'persian_vintage',
  window_treatment: 'heavy_drape', art_arrangement: 'salon', art_content: 'abstract_colour', plant_amount: 0.4, plant_kind: ['palms'],
  light_drama: 0.7, fixture_style: 'brass_geometric', era_hints: ['1930s'],
};
const WARM_MODERN: StyleDialsPatch = between(SCANDI, MID_CENTURY);

const VIBE_POINTS: Record<string, StyleDialsPatch> = {
  retro: between(MID_CENTURY, SEVENTIES, 0.7),
  minimal: SCANDI,
  garden: BOHO_GARDEN,
  moody: MOODY,
  'warm modern': WARM_MODERN,
};
const FAMILY_POINTS: Record<Vibe['shapeFamily'], StyleDialsPatch> = { retro: VIBE_POINTS.retro, modern: WARM_MODERN, garden: BOHO_GARDEN };

