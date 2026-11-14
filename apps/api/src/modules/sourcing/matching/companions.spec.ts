import { Listing } from '@prisma/client';
import { chooseSet, companionFit } from './companions';

const plan = { width: 5.6, depth: 4.4, wallHeight: 2.6, floor: 'wood', walls: {}, windows: [], doors: [], features: [] };
let n = 0;
const listing = (type: string, w: number, d: number, h: number, extra: Partial<Listing> = {}): Listing =>
  ({ id: `l${n++}`, type, size: { w, d, h }, score: 0.6, picked: false, modelUrl: null, ...extra }) as unknown as Listing;

describe('companions', () => {
  const sofa = listing('sofa', 2.2, 0.9, 0.8, { score: 0.9 });
  it('prefers a coffee table about two thirds of the sofa', () => {
    expect(companionFit(listing('coffee_table', 1.35, 0.6, 0.45), sofa, plan)).toBeGreaterThan(companionFit(listing('coffee_table', 0.9, 0.55, 0.45), sofa, plan));
  });
  it('penalises a rug narrower than the sofa', () => {
    expect(companionFit(listing('rug', 1.6, 1.2, 0.02), sofa, plan)).toBeLessThan(companionFit(listing('rug', 2.6, 1.8, 0.02), sofa, plan));
  });
  it('lets a person’s pick win, and gives 3D models a nudge', () => {
    const slots = [{ type: 'sofa', count: 1, required: true, why: '' }, { type: 'rug', count: 1, required: false, why: '' }] as never;
    const small = listing('rug', 1.6, 1.2, 0.02, { score: 0.8 });
    const big = listing('rug', 2.6, 1.8, 0.02, { score: 0.7, modelUrl: 'x' });
    const chosen = chooseSet(slots, new Map([['sofa', [sofa]], ['rug', [small, big]]]), plan);
    expect(chosen[1].listings[0]).toBe(big);
    const mine = listing('rug', 1.5, 1, 0.02, { score: 0.1, picked: true });
    expect(chooseSet(slots, new Map([['sofa', [sofa]], ['rug', [small, big, mine]]]), plan)[1].listings[0]).toBe(mine);
  });
});
