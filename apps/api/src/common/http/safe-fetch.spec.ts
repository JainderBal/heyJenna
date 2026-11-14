import { safeFetch, UnsafeUrlError } from './safe-fetch';

describe('safeFetch', () => {
  it.each([
    'http://example.com/a.jpg',
    'https://localhost/a.jpg',
    'https://127.0.0.1/a.jpg',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.5/x',
    'https://user:pw@example.com/x',
  ])('refuses %s', async (url) => {
    await expect(safeFetch(url)).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});
