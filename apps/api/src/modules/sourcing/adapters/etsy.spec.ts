import { AppConfig } from '../../../common/config/app-config.service';
import { EtsyAdapter } from './etsy.adapter';
import { WebSearchAdapter } from './web-search.adapter';

const config = (env: Record<string, string | undefined>) => ({ get: (k: string) => env[k] }) as unknown as AppConfig;
const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

describe('EtsyAdapter', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('is off without an Etsy or Brave key', () => {
    const cfg = config({});
    expect(new EtsyAdapter(cfg, new WebSearchAdapter(cfg)).enabled()).toBe(false);
  });

  it('searches active listings, then fetches images + shipping, and maps them', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ results: [{ listing_id: 11 }, { listing_id: 22 }] }))
      .mockResolvedValueOnce(
        json({
          results: [
            {
              listing_id: 11,
              title: 'Mid century teak coffee table &amp; tray',
              url: 'https://www.etsy.com/listing/11/teak',
              price: { amount: 45000, divisor: 100, currency_code: 'CAD' },
              images: [{ url_570xN: 'https://i.etsystatic.com/11.jpg' }],
              shipping_profile: { origin_country_iso: 'CA', min_processing_days: 3, max_processing_days: 5 },
            },
            { listing_id: 22, title: 'Rattan chair', url: 'https://www.etsy.com/listing/22/rattan' },
          ],
        }),
      );
    const cfg = config({ ETSY_API_KEY: 'k' });
    const r = await new EtsyAdapter(cfg, new WebSearchAdapter(cfg)).search({ type: 'sofa', text: 'teak coffee table', limit: 5 });

    const [searchUrl, searchInit] = fetchMock.mock.calls[0];
    expect(String(searchUrl)).toContain('/v3/application/listings/active?keywords=teak+coffee+table&limit=5');
    expect(searchInit.headers['x-api-key']).toBe('k');
    expect(String(fetchMock.mock.calls[1][0])).toContain('listings/batch?listing_ids=11%2C22&includes=Images%2CShipping');
    expect(r[0]).toEqual({
      source: 'etsy',
      externalId: '11',
      url: 'https://www.etsy.com/listing/11/teak',
      title: 'Mid century teak coffee table & tray',
      description: undefined,
      price: 450,
      currency: 'CAD',
      imageUrl: 'https://i.etsystatic.com/11.jpg',
      condition: 'unknown',
      location: 'Etsy, ships from CA, ready in 3-5 days',
    });
    expect(r[1]).toMatchObject({ price: null, imageUrl: null, location: 'Etsy, shipping set by shop' });
  });

  it('throws on an HTTP error so the service can report it', async () => {
    fetchMock.mockResolvedValueOnce(json({}, false));
    const cfg = config({ ETSY_API_KEY: 'k' });
    await expect(new EtsyAdapter(cfg, new WebSearchAdapter(cfg)).search({ type: 'sofa', text: 'sofa', limit: 3 })).rejects.toThrow('HTTP 500');
  });

  it('falls back to Brave site:etsy.com results without an Etsy key', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        web: {
          results: [
            { title: 'Velvet sofa | Etsy Canada', url: 'https://www.etsy.com/ca/listing/123/velvet-sofa', description: 'CA$1,200.00 rust velvet', thumbnail: { src: 'https://imgs.search.brave.com/x.jpg' } },
            { title: 'Etsy shop', url: 'https://www.etsy.com/shop/foo' },
          ],
        },
      }),
    );
    const cfg = config({ BRAVE_SEARCH_API_KEY: 'b' });
    const r = await new EtsyAdapter(cfg, new WebSearchAdapter(cfg)).search({ type: 'sofa', text: 'velvet sofa', limit: 4 });

    expect(String(fetchMock.mock.calls[0][0])).toContain('q=site%3Aetsy.com%2Flisting+velvet+sofa');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ source: 'etsy', title: 'Velvet sofa', price: 1200, imageUrl: 'https://imgs.search.brave.com/x.jpg' });
  });
});
