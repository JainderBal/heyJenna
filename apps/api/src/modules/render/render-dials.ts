import { StyleDialValues } from '@hey-jenna/contracts';

/** The style dials the Blender worker maps to materials and lighting (workers/render/blender/dial_mapping.py). */
export const RENDER_DIAL_KEYS = [
  'sheen', 'texture', 'light_level', 'light_drama', 'light_layers',
  'palette_temperature', 'palette_value', 'palette_saturation', 'value_contrast', 'hue_spread', 'accent_share',
] as const;

export type RenderDials = Pick<StyleDialValues, (typeof RENDER_DIAL_KEYS)[number]>;

export function renderDialsOf(dials: StyleDialValues): RenderDials {
  return Object.fromEntries(RENDER_DIAL_KEYS.map((k) => [k, dials[k]])) as RenderDials;
}
