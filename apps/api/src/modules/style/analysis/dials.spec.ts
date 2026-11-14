import { DIAL_COUNT, DIAL_DEFAULTS, DIAL_SECTIONS, StyleDials, StyleDialsPatch, StyleDialsShape, StyleProfile } from '@hey-jenna/contracts';
import { rgbToLab, hexToRgb } from './colour';
import { deriveDials, deriveDialsWithOrigin, measuredDials } from './dials';
import { PaletteResult } from './palette';
import { RuleVibeReader } from './rule-vibe.reader';

const cluster = (hex: string, share: number) => ({ hex, share, lab: rgbToLab(hexToRgb(hex)) });
const warmBoard: PaletteResult = {
  dominant: ['#EFE3C8'], secondary: ['#A0612B'], accent: ['#C8332B', '#2E4FC4'],
  clusters: [cluster('#EFE3C8', 0.5), cluster('#A0612B', 0.3), cluster('#C8332B', 0.1), cluster('#2E4FC4', 0.1)],
  warmth: 0.6, saturation: 0.5, lightness: 0.6,
};

describe('StyleDials schema', () => {
  it('has the 55 dials from the doc and fills every default', () => {
    expect(DIAL_COUNT).toBe(55);
    expect(StyleDials.parse({})).toEqual(DIAL_DEFAULTS);
  });
  it('keeps given dials and fills the rest', () => {
    const d = StyleDials.parse({ plant_amount: 0.9, rug_type: 'shag' });
    expect(d.plant_amount).toBe(0.9);
    expect(d.rug_type).toBe('shag');
    expect(d.curvature).toBe(DIAL_DEFAULTS.curvature);
  });
  it('rejects out-of-range numbers, unknown enum values and unknown dials in a patch', () => {
    expect(StyleDialsPatch.safeParse({ curvature: 1.2 }).success).toBe(false);
    expect(StyleDialsPatch.safeParse({ accent_share: 0.5 }).success).toBe(false);
    expect(StyleDialsPatch.safeParse({ light_warmth_k: 1800 }).success).toBe(false);
    expect(StyleDialsPatch.safeParse({ rug_type: 'astroturf' }).success).toBe(false);
    expect(StyleDialsPatch.safeParse({ fabric: [] }).success).toBe(false);
    expect(StyleDialsPatch.safeParse({ sparkle: 1 }).success).toBe(false);
    expect(StyleDialsPatch.safeParse({ curvature: 0.8, fabric: ['velvet', 'linen'] }).success).toBe(true);
  });
  it('old profiles without dials still parse and get defaults', () => {
    const p = StyleProfile.parse({
      name: 'x', source: 'y', palette: { dominant: ['#FFFFFF'], secondary: ['#000000'], accent: ['#FF0000'] },
      keywords: [], vibe: [], warmth: 0, saturation: 0, lightness: 0.5,
    });
    expect(p.dials).toEqual(DIAL_DEFAULTS);
  });
});

describe('DIAL_SECTIONS (the Style tab metadata)', () => {
  const dials = DIAL_SECTIONS.flatMap((s) => s.dials);
  it('lists every dial of the schema exactly once', () => {
    expect(dials.map((d) => d.key).sort()).toEqual(Object.keys(StyleDialsShape.shape).sort());
  });
  it('has the same ranges and options as the schema', () => {
    for (const d of dials) {
      const field = StyleDialsShape.shape[d.key];
      const ok = (v: unknown) => field.safeParse(v).success;
      if (d.kind === 'number') {
        expect([d.key, ok(d.min), ok(d.max), ok(d.min - d.step), ok(d.max + d.step)]).toEqual([d.key, true, true, false, false]);
      } else if (d.kind === 'enum') {
        expect([d.key, d.options.every(ok), ok('nope')]).toEqual([d.key, true, false]);
      } else {
        expect([d.key, ok([...d.options]), ok(d.options.slice(0, d.min)), ok(d.min ? [] : ['nope'])]).toEqual([d.key, true, true, false]);
      }
    }
  });
});

describe('deriveDialsWithOrigin', () => {
  it('names the dials read from the images; the rest come from the preset or the defaults', () => {
    const v = { name: 'retro', vibe: [], keywords: [], shapeFamily: 'retro' as const, materials: {}, stylingDensity: 'balanced' as const, source: 'rules' as const };
    const { dials, measured } = deriveDialsWithOrigin(warmBoard, v);
    expect(dials).toEqual(deriveDials(warmBoard, v));
    expect(measured).toEqual(expect.arrayContaining(['palette_temperature', 'hue_spread', 'wood_tone', 'styling_density', 'light_level']));
    expect(measured).not.toContain('curvature');
    expect(measured).not.toContain('rug_type');
  });
});

describe('deriveDials', () => {
  it('measures colour dials from the palette', () => {
    const m = measuredDials(warmBoard);
    expect(m.palette_temperature).toBe(0.8);
    expect(m.palette_value).toBe(0.6);
    expect(m.palette_saturation).toBe(0.5);
    expect(m.value_contrast).toBeGreaterThan(0.5);
    expect(m.hue_spread).toBeGreaterThanOrEqual(0.5); // tan, red, blue
    expect(m.accent_share).toBe(0.2);
    expect(m.wood_amount).toBeGreaterThan(0); // the tan cluster reads as wood
  });
  it('a monochrome grey board has no hue spread and no wood', () => {
    const grey: PaletteResult = { ...warmBoard, clusters: [cluster('#EEEEEE', 0.6), cluster('#333333', 0.4)], accent: [] };
    const m = measuredDials(grey);
    expect(m.hue_spread).toBe(0);
    expect(m.wood_tone).toBeUndefined();
  });
  it('retro boards sit between Mid-century and 1970s with warm lamps', async () => {
    const vibe = await new RuleVibeReader().read([], warmBoard);
    const d = deriveDials(warmBoard, vibe);
    expect(vibe.name).toBe('retro');
    expect(d.modularity).toBeCloseTo(0.55);
    expect(d.era_hints).toContain('1970s');
    expect(d.fabric[0]).toBe('boucle');
    expect(d.light_warmth_k).toBe(2400);
    expect(d.styling_density).toBe(0.55);
    expect(StyleDials.parse(d)).toEqual(d); // always valid
  });
  it('minimal boards read as Scandi and sparse', async () => {
    const pale: PaletteResult = { ...warmBoard, warmth: 0, saturation: 0.1, lightness: 0.85 };
    const vibe = await new RuleVibeReader().read([], pale);
    const d = deriveDials(pale, vibe);
    expect(d.negative_space).toBe(0.75);
    expect(d.styling_density).toBeLessThan(0.4);
    expect(d.light_warmth_k).toBe(2700);
  });
  it('unknown vibe names fall back to the shape family, then the defaults', () => {
    const d = deriveDials(warmBoard, { name: 'whatever', vibe: [], keywords: [], shapeFamily: 'garden', materials: {}, stylingDensity: 'layered', source: 'claude' });
    expect(d.plant_amount).toBeGreaterThanOrEqual(0.85);
    expect(d.styling_density).toBe(0.8);
  });
});
