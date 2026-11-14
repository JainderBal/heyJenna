import { classifyTitle } from './classify';
import { sizeFor } from './dimensions';
import { shoppingList } from './shopping-list';

describe('classifyTitle', () => {
  it.each([
    ['Mid century teak coffee table', 'coffee_table'],
    ['Herman Miller office chair', 'desk_chair'],
    ['Vintage velvet 3-seat sofa', 'sofa'],
    ['IKEA KALLAX shelf unit', 'shelf'],
    ['Mushroom table lamp, orange', 'table_lamp'],
    ['Wool rug 160x230', 'rug'],
    ['Teak sideboard / credenza', 'sideboard'],
    ['Box of books', null],
  ])('%s → %s', (title, type) => expect(classifyTitle(title)).toBe(type));
});

describe('sizeFor', () => {
  it('reads inches with quote marks', () => {
    const { size, estimated } = sizeFor('Sofa 84"W x 36"D x 32"H', 'sofa');
    expect(estimated).toBe(false);
    expect(size.w).toBeCloseTo(2.134, 2);
    expect(size.h).toBeCloseTo(0.813, 2);
  });
  it('reads cm triples', () => {
    expect(sizeFor('Dimensions 200 x 90 x 80 cm', 'sofa').size).toEqual({ w: 2, d: 0.9, h: 0.8 });
  });
  it('reads labelled sizes', () => {
    expect(sizeFor('Width: 120 cm, Depth: 60 cm, Height: 75 cm', 'desk').size).toEqual({ w: 1.2, d: 0.6, h: 0.75 });
  });
  it('reads rugs in feet', () => {
    const { size } = sizeFor('Beni ourain rug 5x8', 'rug');
    expect(size.w).toBeCloseTo(2.438, 2);
    expect(size.d).toBeCloseTo(1.524, 2);
  });
  it('falls back to a typical size', () => {
    const r = sizeFor('Lovely armchair', 'armchair');
    expect(r.estimated).toBe(true);
    expect(r.size.w).toBeGreaterThan(0.5);
  });
  it('throws away nonsense', () => {
    expect(sizeFor('Sofa 2000 x 3 x 1', 'sofa').estimated).toBe(true);
  });
});

describe('shoppingList', () => {
  const plan = { width: 5, depth: 4.4, wallHeight: 2.6, floor: 'wood', walls: {}, windows: [], doors: [], features: [] };
  it('adds work and cat pieces from needs', () => {
    const types = shoppingList(plan, ['works from home', 'has a cat']).map((s) => s.type);
    expect(types).toEqual(expect.arrayContaining(['sofa', 'desk', 'desk_chair', 'cat_tree']));
    expect(types).not.toContain('shelf');
  });
});
