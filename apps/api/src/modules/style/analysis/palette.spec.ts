import sharp from 'sharp';
import { nearestColourName } from './colour-names';
import { extractPalette } from './palette';

/** A test "moodboard": big cream area, a teak band, a small red pop. */
async function board(): Promise<Buffer> {
  const w = 120, h = 120;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      let c = [239, 227, 200]; // cream (most of it)
      if (y > 70) c = [160, 97, 43]; // teak band
      if (x > 100 && y < 12) c = [200, 51, 43]; // small red pop
      raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2];
    }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

describe('extractPalette', () => {
  it('puts the big calm colour in dominant and the small vivid one in accent', async () => {
    const p = await extractPalette([await board()]);
    expect(nearestColourName(p.dominant[0])).toBe('cream');
    expect(p.accent.map(nearestColourName)).toContain('red');
    expect([...p.dominant, ...p.secondary].map(nearestColourName)).toContain('teak');
    expect(p.warmth).toBeGreaterThan(0.2);
  });

  it('reads a grey-blue board as cool and low-saturation', async () => {
    const img = await sharp({ create: { width: 60, height: 60, channels: 3, background: { r: 120, g: 135, b: 160 } } }).png().toBuffer();
    const p = await extractPalette([img]);
    expect(p.warmth).toBeLessThan(0);
    expect(p.saturation).toBeLessThan(0.4);
  });
});
