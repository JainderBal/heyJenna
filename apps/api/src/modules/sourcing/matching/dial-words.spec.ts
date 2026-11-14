import { DIAL_DEFAULTS, StyleProfile } from '@hey-jenna/contracts';
import { dialWords, materialWord } from './dial-words';
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
});
