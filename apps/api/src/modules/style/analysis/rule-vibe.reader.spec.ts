import { RuleVibeReader } from './rule-vibe.reader';
import { PaletteResult } from './palette';

const base: PaletteResult = { dominant: ['#EFE3C8'], secondary: ['#A0612B'], accent: ['#C8332B'], clusters: [], warmth: 0, saturation: 0, lightness: 0.5 };

describe('RuleVibeReader', () => {
  const reader = new RuleVibeReader();
  it('warm + saturated → retro keywords', async () => {
    const v = await reader.read([], { ...base, warmth: 0.6, saturation: 0.5 });
    expect(v.shapeFamily).toBe('retro');
    expect(v.keywords).toContain('mid century');
    expect(v.vibe).toContain('cream');
  });
  it('pale + grey → minimal', async () => {
    const v = await reader.read([], { ...base, saturation: 0.1, lightness: 0.8 });
    expect(v.name).toBe('minimal');
    expect(v.stylingDensity).toBe('sparse');
  });
});
