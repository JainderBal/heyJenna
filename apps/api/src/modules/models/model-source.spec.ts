import { BadModelError, checkGlb, checkModelUrl, MAX_MODEL_BYTES } from './model-source';

const HOSTS = ['web-api.ikea.com'];

describe('checkModelUrl', () => {
  it('accepts an https IKEA model URL', () => {
    expect(checkModelUrl('https://web-api.ikea.com/dimma/assets/1.0/glb/x.glb', HOSTS).hostname).toBe('web-api.ikea.com');
  });
  it.each([
    ['http://web-api.ikea.com/x.glb', 'https'],
    ['https://evil.example.com/x.glb', 'only fetched from'],
    ['https://web-api.ikea.com.evil.com/x.glb', 'only fetched from'],
    ['https://user:pw@web-api.ikea.com/x.glb', 'credentials'],
    ['not a url', 'valid'],
  ])('refuses %s', (url, why) => {
    expect(() => checkModelUrl(url, HOSTS)).toThrow(BadModelError);
    expect(() => checkModelUrl(url, HOSTS)).toThrow(why);
  });
});

describe('checkGlb', () => {
  const glb = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(16)]);
  it('accepts a binary glTF', () => expect(checkGlb(glb)).toBe(glb));
  it('refuses something that is not glTF', () => expect(() => checkGlb(Buffer.from('<html>not a model</html>'))).toThrow('Not a .glb'));
  it('refuses files over the limit', () => {
    expect(() => checkGlb(glb, 10)).toThrow('too large');
    expect(MAX_MODEL_BYTES).toBe(40 * 1024 * 1024);
  });
});
