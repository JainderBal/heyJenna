import { MockAdapter } from './mock.adapter';
import { findPrice } from './source.adapter';

describe('findPrice', () => {
  it.each([
    ['Teak sideboard $450', 450],
    ['CA $1,250.00 sofa', 1250],
    ['Lamp 35 $', 35],
    ['No price here', null],
  ])('%s → %s', (text, price) => expect(findPrice(text)).toBe(price));
});

describe('MockAdapter', () => {
  it('returns only the asked type', async () => {
    const r = await new MockAdapter().search({ type: 'sofa', text: 'retro sofa', limit: 10 });
    expect(r.length).toBeGreaterThan(2);
    expect(r.every((l) => l.url.startsWith('https://example.com/mock/'))).toBe(true);
  });
});
