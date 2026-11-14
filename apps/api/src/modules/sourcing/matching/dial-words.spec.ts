import { DIAL_DEFAULTS, StyleProfile } from '@hey-jenna/contracts';
import { dialWords, materialWord, shapeWords } from './dial-words';
import { queryParts } from './query';
import { scoreListing } from './scoring';

const dials = { ...DIAL_DEFAULTS, fabric: ['boucle', 'velvet'] as StyleProfile['dials']['fabric'], rug_type: 'jute_sisal' as const, wood_tone: 0.8, fixture_style: 'paper_lantern' as const, ornament: 0.1 };
const style: StyleProfile = {
  name: 'retro', source: 'test', keywords: ['mid century'], vibe: [], palette: { dominant: ['#EFE3C8'], secondary: ['#A0612B'], accent: ['#C8643C'] },
  shapeFamily: 'retro', materials: {}, warmth: 0.6, saturation: 0.5, lightness: 0.6, dials,
};
const plan = { width: 5, depth: 4, wallHeight: 2.6, floor: 'wood', walls: {}, windows: [], doors: [], features: [] };
const listing = (text: string) => ({ type: 'sofa' as const, text, size: { w: 2, d: 0.9, h: 0.8 }, sizeEstimated: false, price: 500 });

describe('dial words', () => {
  it('picks one material word per type', () => {
    expect(materialWord('sofa', dials)).toBe('boucle');
    expect(materialWord('rug', dials)).toBe('jute');
    expect(materialWord('coffee_table', dials)).toBe('walnut');
    expect(materialWord('ceiling_light', dials)).toBe('paper');
    expect(materialWord('coffee_table', { ...dials, metal_amount: 0.9, wood_amount: 0.2, metal_finish: 'brass' })).toBe('brass');
    expect(materialWord('sofa', undefined)).toBeUndefined();
  });
  it('the IKEA search gets the material as an extra part', () => {
    expect(queryParts('sofa', style).material).toBe('boucle');
  });
  it('fabric words raise the style score; ornate pieces drop on a plain board', () => {
    const plain = scoreListing(listing('3-seat sofa'), style, plan);
    const boucle = scoreListing(listing('boucle 3-seat sofa'), style, plan);
    const tufted = scoreListing(listing('tufted mid century sofa'), style, plan);
    const sleek = scoreListing(listing('mid century sofa'), style, plan);
    expect(boucle.style).toBeGreaterThan(plain.style);
    expect(boucle.matchedWords).toContain('boucle');
    expect(tufted.style).toBeLessThan(sleek.style);
    expect(dialWords('sofa', dials)).toEqual(expect.arrayContaining(['boucle', 'velvet']));
  });

  describe('shape dials', () => {
    const round = { ...dials, curvature: 0.9, mass: 0.9, modularity: 0.9, arm_style: 'rolled' as const, leg_style: 'hairpin' as const, leg_lift: 0.9 };
    const sharp = { ...dials, curvature: 0.1, mass: 0.1, modularity: 0.1, arm_style: 'track' as const, leg_style: 'plinth' as const, leg_lift: 0.1, line_direction: 0.1 };
    it('different dial values give different words, only for types they suit', () => {
      expect(shapeWords('sofa', round)).toEqual(expect.arrayContaining(['modular', 'sectional', 'rolled arm', 'hairpin legs', 'rounded', 'curved', 'arched', 'chunky']));
      expect(shapeWords('sofa', sharp)).toEqual(expect.arrayContaining(['track arm', 'plinth', 'slim', 'tall']));
      expect(shapeWords('sofa', sharp)).not.toContain('rounded');
      expect(shapeWords('coffee_table', round)).toContain('hairpin legs');
      expect(shapeWords('coffee_table', round)).not.toContain('rolled arm');
      expect(shapeWords('coffee_table', round)).not.toContain('modular');
      expect(shapeWords('rug', round)).toEqual([]);
      expect(shapeWords('sofa', undefined)).toEqual([]);
    });
    it('the IKEA search gets the top shape word', () => {
      expect(queryParts('sofa', { ...style, dials: round }).shape).toBe('modular');
      expect(queryParts('sofa', { ...style, dials: sharp }).shape).toBe('track arm');
      expect(queryParts('rug', { ...style, dials: round }).shape).toBeUndefined();
    });
    it('shape words reorder listings but stay a tiebreaker', () => {
      const s = { ...style, dials: round };
      const plain = scoreListing(listing('mid century sofa'), s, plan);
      const shaped = scoreListing(listing('mid century modular sofa with rolled arm'), s, plan);
      expect(shaped.style).toBeGreaterThan(plain.style);
      expect(shaped.matchedWords).toEqual(expect.arrayContaining(['modular', 'rolled arm']));
      expect(shaped.style - plain.style).toBeLessThanOrEqual(0.15);
      const sharpScore = scoreListing(listing('mid century modular sofa with rolled arm'), { ...style, dials: sharp }, plan);
      expect(sharpScore.style).toBeLessThan(shaped.style);
      // a wrong-sized listing with perfect shape words still loses to a right-sized plain one
      const tiny = scoreListing({ ...listing('modular rolled arm sofa'), size: { w: 0.6, d: 0.5, h: 0.5 } }, s, plan);
      expect(tiny.total).toBeLessThan(plain.total);
    });
  });
});
