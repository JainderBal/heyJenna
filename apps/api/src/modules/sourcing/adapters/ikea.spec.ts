import { parseIkeaMeasurements } from './ikea-product-page';

const page = (inner: string) => `<div class="pipf-measurements-tab__layout"> <span>Measurements</span> ${inner} <span>Packaging</span></div>`;

describe('parseIkeaMeasurements', () => {
  it('reads a sofa', () => {
    const html = page('<dt>Depth</dt><dd>95 cm (37 3/8 &quot;)</dd><dt>Height</dt><dd>71 cm (28 &quot;)</dd><dt>Seat height</dt><dd>46 cm</dd><dt>Width</dt><dd>240 cm (94 1/2 &quot;)</dd>');
    expect(parseIkeaMeasurements(html)).toEqual({ w: 2.4, d: 0.95, h: 0.71 });
  });
  it('ignores compound labels like "Armrest width"', () => {
    const html = page('<dt>Armrest width</dt><dd>10 cm</dd><dt>Width</dt><dd>216 cm</dd><dt>Depth</dt><dd>88 cm</dd><dt>Seat width</dt><dd>180 cm</dd><dt>Height</dt><dd>80 cm</dd>');
    expect(parseIkeaMeasurements(html)).toEqual({ w: 2.16, d: 0.88, h: 0.8 });
  });
  it('takes "Height including back cushions" as the height', () => {
    expect(parseIkeaMeasurements(page('<dt>Width</dt><dd>158 cm</dd><dt>Depth</dt><dd>95 cm</dd><dt>Height including back cushions</dt><dd>80 cm</dd>'))).toEqual({ w: 1.58, d: 0.95, h: 0.8 });
  });
  it('reads a round table by diameter', () => {
    expect(parseIkeaMeasurements(page('Diameter 90 cm Height 45 cm'))).toEqual({ w: 0.9, d: 0.9, h: 0.45 });
  });
  it('reads a rug (no height)', () => {
    expect(parseIkeaMeasurements(page('Length: 230 cm Width: 160 cm'))).toEqual({ w: 2.3, d: 1.6, h: 0.02 });
  });
  it('returns null without a measurements section', () => {
    expect(parseIkeaMeasurements('<html></html>')).toBeNull();
  });
});
