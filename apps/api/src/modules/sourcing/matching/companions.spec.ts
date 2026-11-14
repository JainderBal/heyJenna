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
  it('prefers low, wide shelving over a lone tall tower', () => {
    expect(companionFit(listing('shelf', 1.47, 0.39, 1.47), sofa, plan)).toBeGreaterThan(companionFit(listing('shelf', 0.4, 0.28, 2.02), sofa, plan));
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

  const slots = [
    { type: 'sofa', count: 1, required: true, why: '' },
    { type: 'rug', count: 1, required: false, why: '' },
  ] as never;

  it('drops an optional piece that does not fit what is left of the cap', () => {
    const sofa = listing('sofa', 2.2, 0.9, 0.8, { score: 0.8, price: 400 });
    const rug = listing('rug', 2.6, 1.8, 0.02, { score: 0.9, price: 200 });
    const chosen = chooseSet(slots, new Map([['sofa', [sofa]], ['rug', [rug]]]), plan, 500);
    expect(chosen[0].listings).toEqual([sofa]);
    expect(chosen[1].listings).toEqual([]);
  });

  it('keeps a person’s pick even when it costs more than the cap', () => {
    const sofa = listing('sofa', 2.2, 0.9, 0.8, { score: 0.5, price: 100 });
    const mine = listing('rug', 2.6, 1.8, 0.02, { score: 0.1, picked: true, price: 800 });
    const chosen = chooseSet(slots, new Map([['sofa', [sofa]], ['rug', [mine]]]), plan, 500);
    expect(chosen[1].listings[0]).toBe(mine);
    expect(chosen[0].listings[0]).toBe(sofa);
  });

  it('takes the cheapest sofa when every sofa is over the cap, and skips optionals', () => {
    const nice = listing('sofa', 2.2, 0.9, 0.8, { score: 0.9, price: 800 });
    const cheap = listing('sofa', 2.2, 0.9, 0.8, { score: 0.2, price: 400 });
    const lamp = listing('floor_lamp', 0.4, 0.4, 1.6, { score: 0.8, price: 50 });
    const withLamp = [...slots, { type: 'floor_lamp', count: 1, required: false, why: '' }] as never;
    const chosen = chooseSet(withLamp, new Map([['sofa', [nice, cheap]], ['floor_lamp', [lamp]]]), plan, 100);
    expect(chosen[0].listings).toEqual([cheap]);
    expect(chosen[2].listings).toEqual([]);
  });

  it('prefers a cheaper piece that fits over a better one that does not', () => {
    const sofa = listing('sofa', 2.2, 0.9, 0.8, { score: 0.8, price: 400 });
    const fancy = listing('rug', 2.6, 1.8, 0.02, { score: 0.9, price: 700 });
    const plain = listing('rug', 2.6, 1.8, 0.02, { score: 0.4, price: 200 });
    const chosen = chooseSet(slots, new Map([['sofa', [sofa]], ['rug', [fancy, plain]]]), plan, 1000);
    expect(chosen[1].listings).toEqual([plain]);
  });
});
