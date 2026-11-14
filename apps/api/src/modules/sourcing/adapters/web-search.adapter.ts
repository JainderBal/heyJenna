import { Injectable } from '@nestjs/common';
import { ListingSource } from '@hey-jenna/contracts';
import { AppConfig } from '../../../common/config/app-config.service';
import { findPrice, RawListing, SourceAdapter, SourceQuery } from './source.adapter';

/**
 * Finds listings on Kijiji, Facebook Marketplace and IKEA through a search engine API (Brave).
 * We never scrape those sites: we only keep what the search engine returns (title, link, snippet, thumbnail).
 */
const SITES: { source: ListingSource; site: string; isItem: RegExp }[] = [
  { source: 'kijiji', site: 'kijiji.ca', isItem: /kijiji\.ca\/v-/ },
  { source: 'facebook', site: 'facebook.com/marketplace', isItem: /facebook\.com\/marketplace\/item\// },
  { source: 'ikea', site: 'ikea.com/ca', isItem: /ikea\.com\/ca\/[a-z]{2}\/p\// },
];

interface BraveResult {
  title: string;
  url: string;
  description?: string;
  thumbnail?: { src?: string };
}

@Injectable()
export class WebSearchAdapter implements SourceAdapter {
  readonly name = 'web';

  constructor(private readonly config: AppConfig) {}

  enabled() {
    return Boolean(this.config.get('BRAVE_SEARCH_API_KEY'));
  }

  async search(q: SourceQuery): Promise<RawListing[]> {
    const perSite = Math.max(3, Math.ceil(q.limit / SITES.length) + 2);
    const batches = await Promise.all(SITES.map((s) => this.searchSite(s, q.text, perSite).catch(() => [])));
    return batches.flat();
  }

  private async searchSite(s: (typeof SITES)[number], text: string, count: number): Promise<RawListing[]> {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', `site:${s.site} ${text}`);
    url.searchParams.set('count', String(Math.min(count, 20)));
    url.searchParams.set('country', 'ca');
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'x-subscription-token': this.config.get('BRAVE_SEARCH_API_KEY')! },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`search failed: HTTP ${res.status}`);
    const body = (await res.json()) as { web?: { results?: BraveResult[] } };
    return (body.web?.results ?? [])
      .filter((r) => s.isItem.test(r.url))
      .map((r) => {
        const description = stripTags(r.description ?? '');
        const title = stripTags(r.title).replace(/\s*[|-]\s*(Kijiji|Facebook Marketplace|IKEA).*$/i, '');
        return {
          source: s.source,
          externalId: r.url,
          url: r.url,
          title,
          description,
          price: findPrice(`${r.title} ${description}`),
          currency: 'CAD',
          imageUrl: r.thumbnail?.src ?? null,
          condition: s.source === 'ikea' ? 'new' : 'used',
          location: null,
        } satisfies RawListing;
      });
  }
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").trim();
