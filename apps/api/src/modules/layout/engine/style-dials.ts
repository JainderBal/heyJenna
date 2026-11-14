import { densityBand, FloorPlan, StyleDialValues } from '@hey-jenna/contracts';

/**
 * Style dials → the fields design_logic.py's style_profile already reads (doc section 6).
 * Only dials the engine can act on today are mapped; the full dial set is passed through as
 * `dials` so later engine work can read the rest.
 */
const ART_CONTENT: Record<StyleDialValues['art_content'], string> = {
  abstract_colour: 'abstract colour blocks', line_drawing: 'line drawings', botanical: 'botanical prints', photography: 'photography',
  graphic_poster: 'graphic posters', landscape: 'landscapes', classical_portrait: 'classical portraits', textile_hanging: 'textile hanging', mirror: 'mirror',
};
const ALL_FILLERS = ['lounge_chair', 'plant_group', 'side_table', 'pouf', 'reading_lamp'];
type RGB = [number, number, number];
const WOOD_STOPS: [number, RGB][] = [[0, [226, 201, 160]], [0.5, [185, 115, 58]], [1, [78, 48, 32]]];

function woodAt(t: number): string {
  const i = t <= 0.5 ? 0 : 1;
  const [a, ca] = WOOD_STOPS[i];
  const [b, cb] = WOOD_STOPS[i + 1];
  const k = (t - a) / (b - a);
  return '#' + ca.map((c, j) => Math.round(c + (cb[j] - c) * k).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Wood tone 0 pale … 1 dark → a main wood colour and its lighter partner. */
export function woodColours(tone: number): { wood: string; wood_light: string } {
  const t = Math.max(0, Math.min(1, tone));
  return { wood: woodAt(t), wood_light: woodAt(Math.max(0, t - 0.25)) };
}

/** profile: fields merged into style_profile. wood: material colours, only when the board named no wood. */
export function engineStyleFromDials(d: StyleDialValues, plan: FloorPlan, materials: { wood?: string }) {
  const area = plan.width * plan.depth;
  const prefer: string[] = [];
  if (d.zone_definition > 0.6) prefer.push('platform', 'half_wall');
  if (d.rawness > 0.6) prefer.push('ceiling_beam');
  if (d.wall_treatment === 'panelling') prefer.push('wainscoting');
  if (['colour_drenched', 'two_tone', 'wallpaper'].includes(d.wall_treatment)) prefer.push('feature_wall');
  if (d.books_and_objects > 0.7) prefer.push('built_in_shelf');

  let fillers = ALL_FILLERS;
  if (d.negative_space > 0.7) fillers = fillers.filter((f) => f !== 'pouf' && f !== 'side_table');
  if (d.negative_space > 0.85) fillers = fillers.filter((f) => f !== 'lounge_chair');
  if (d.grouping < 0.4) fillers = fillers.filter((f) => f !== 'plant_group');

  return {
    wood: materials.wood ? {} : woodColours(d.wood_tone),
    profile: {
      styling_density: densityBand(d.styling_density),
      plant_count: Math.min(Math.round(d.plant_amount * 8), Math.max(1, Math.floor(area / 3))),
      art: { content: ART_CONTENT[d.art_content], arrangement: d.art_arrangement === 'single_statement' ? 'single' : d.art_arrangement },
      light_warmth_k: d.light_warmth_k,
      features: { prefer: [...new Set(prefer)], max: Math.round(d.architectural_detail * 3) },
      fillers,
      dials: d,
    },
  };
}
