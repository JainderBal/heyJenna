import { DIAL_DEFAULTS, StyleProfile } from '@hey-jenna/contracts';
import { scoreListing } from './scoring';

const style: StyleProfile = {
  name: 'retro', source: 'test', keywords: ['mid century', 'teak', 'velvet'], vibe: ['70s', 'warm'],
  palette: { dominant: ['#EFE3C8'], secondary: ['#A0612B'], accent: ['#C8643C'] },
  shapeFamily: 'retro', materials: {}, warmth: 0.6, saturation: 0.5, lightness: 0.6, dials: DIAL_DEFAULTS,
};
const plan = { width: 5, depth: 4.4, wallHeight: 2.6, floor: 'wood', walls: {}, windows: [], doors: [], features: [] };
const size = { w: 2.1, d: 0.9, h: 0.8 };

describe('scoreListing', () => {
  it('prefers a matching retro sofa over a grey modern one', () => {
    const retro = scoreListing({ type: 'sofa', text: 'Mid century teak rust velvet sofa', size, sizeEstimated: false, price: 600 }, style, plan);
    const grey = scoreListing({ type: 'sofa', text: 'Modern grey linen sofa', size, sizeEstimated: false, price: 600 }, style, plan);
    expect(retro.total).toBeGreaterThan(grey.total);
    expect(retro.matchedWords).toEqual(expect.arrayContaining(['mid century', 'teak', 'velvet']));
  });
  it('gives zero fit to a sofa too big for the room', () => {
    const s = scoreListing({ type: 'sofa', text: 'sofa', size: { w: 3.8, d: 1.1, h: 0.8 }, sizeEstimated: false, price: 1 }, style, plan);
    expect(s.fit).toBe(0);
  });
});
