import { nearestColourName } from './colour-names';
import { PaletteResult } from './palette';
import { Vibe, VibeReader } from './vibe';

/** Works without any AI: guesses the vibe from warmth, saturation, lightness and colour names. */
export class RuleVibeReader implements VibeReader {
  async read(_images: Buffer[], p: PaletteResult): Promise<Vibe> {
    const names = [...p.dominant, ...p.secondary, ...p.accent].map(nearestColourName);
    const greenShare = p.clusters
      .filter((c) => ['green', 'sage', 'olive'].includes(nearestColourName(c.hex)))
      .reduce((s, c) => s + c.share, 0);

    if (greenShare > 0.25)
      return this.vibe('garden', ['botanical', 'natural', 'calm'], ['rattan', 'cane', 'linen', 'natural wood'], 'garden', 'wicker', 'linen', 'layered', names);
    if (p.warmth > 0.25 && p.saturation > 0.35)
      return this.vibe('retro', ['70s', 'warm', 'playful'], ['mid century', 'retro', 'teak', 'velvet'], 'retro', 'chrome', 'boucle', 'balanced', names);
    if (p.saturation < 0.2 && p.lightness > 0.6)
      return this.vibe('minimal', ['calm', 'airy', 'minimal'], ['scandinavian', 'minimalist', 'light oak', 'linen'], 'modern', 'black steel', 'linen', 'sparse', names);
    if (p.lightness < 0.4)
      return this.vibe('moody', ['moody', 'cosy', 'rich'], ['velvet', 'walnut', 'brass', 'dark wood'], 'modern', 'brass', 'velvet', 'layered', names);
    return this.vibe('warm modern', ['warm', 'relaxed'], ['modern', 'oak', 'boucle'], 'modern', 'black steel', 'boucle', 'balanced', names);
  }

  private vibe(
    name: string, vibe: string[], keywords: string[], shapeFamily: Vibe['shapeFamily'],
    metal: string, fabric: string, stylingDensity: Vibe['stylingDensity'], colourNames: string[],
  ): Vibe {
    const colours = [...new Set(colourNames)].slice(0, 3);
    return { name, vibe: [...vibe, ...colours], keywords, shapeFamily, materials: { metal, fabric }, stylingDensity, source: 'rules' };
  }
}
