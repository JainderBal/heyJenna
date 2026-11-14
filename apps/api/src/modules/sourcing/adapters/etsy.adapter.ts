import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../common/config/app-config.service';
import { RawListing, SourceAdapter, SourceQuery } from './source.adapter';
import { SiteSpec, WebSearchAdapter } from './web-search.adapter';

interface EtsyMoney {
  amount: number;
  divisor: number;
  currency_code: string;
}

interface EtsyListing {
  listing_id: number;
  title: string;
  description?: string;
  url: string;
  price?: EtsyMoney;
  images?: { url_570xN?: string; url_fullxfull?: string }[];
  shipping_profile?: { origin_country_iso?: string; min_processing_days?: number; max_processing_days?: number } | null;
}

const API = 'https://openapi.etsy.com/v3/application';
export const ETSY_SITE: SiteSpec = { source: 'etsy', site: 'etsy.com/listing', isItem: /etsy\.com\/([a-z]{2}(-[a-z]{2})?\/)?listing\/\d+/ };

/**
 * Etsy's official Open API v3 (active listings, with images). Needs ETSY_API_KEY.
 * Without it, falls back to Brave search results restricted to etsy.com (no scraping), like Kijiji / FB.
 */
@Injectable()
export class EtsyAdapter implements SourceAdapter {
  readonly name = 'etsy';

  constructor(
    private readonly config: AppConfig,
    private readonly web: WebSearchAdapter,
  ) {}

  enabled() {
    return Boolean(this.config.get('ETSY_API_KEY') || this.config.get('BRAVE_SEARCH_API_KEY'));
  }

  async search(q: SourceQuery): Promise<RawListing[]> {
    if (!this.config.get('ETSY_API_KEY')) return this.web.searchSite(ETSY_SITE, q.text, q.limit);

    const url = new URL(`${API}/listings/active`);
    url.searchParams.set('keywords', q.text);
    url.searchParams.set('limit', String(Math.min(q.limit, 100)));
    const found = await this.get<{ results?: { listing_id: number }[] }>(url);
    const ids = (found.results ?? []).map((r) => r.listing_id);
    if (!ids.length) return [];

    // the search endpoint has no images; the batch endpoint returns them (and the shipping profile) in one call
    const batch = new URL(`${API}/listings/batch`);
    batch.searchParams.set('listing_ids', ids.join(','));
    batch.searchParams.set('includes', 'Images,Shipping');
    const full = await this.get<{ results?: EtsyListing[] }>(batch);
    return (full.results ?? []).map(toRaw);
  }

  private async get<T>(url: URL): Promise<T> {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'x-api-key': this.config.get('ETSY_API_KEY')! },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Etsy request failed: HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}

function toRaw(it: EtsyListing): RawListing {
  const ship = it.shipping_profile;
  const days = ship?.min_processing_days != null && ship.max_processing_days != null ? `, ready in ${ship.min_processing_days}-${ship.max_processing_days} days` : '';
  return {
    source: 'etsy',
    externalId: String(it.listing_id),
    url: it.url,
    title: decode(it.title),
    description: it.description ? decode(it.description) : undefined,
    price: it.price && it.price.divisor ? it.price.amount / it.price.divisor : null,
    currency: it.price?.currency_code ?? 'CAD',
    imageUrl: it.images?.[0]?.url_570xN ?? it.images?.[0]?.url_fullxfull ?? null,
    condition: 'unknown',
    // seller is always "Etsy" (the source); the shipping note goes where other sources put location
    location: ship?.origin_country_iso ? `Etsy, ships from ${ship.origin_country_iso}${days}` : 'Etsy, shipping set by shop',
  };
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");
