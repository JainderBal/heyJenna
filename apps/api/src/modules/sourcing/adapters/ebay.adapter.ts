import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../common/config/app-config.service';
import { RawListing, SourceAdapter, SourceQuery } from './source.adapter';

interface EbayItem {
  itemId: string;
  title: string;
  shortDescription?: string;
  itemWebUrl: string;
  price?: { value: string; currency: string };
  image?: { imageUrl: string };
  condition?: string;
  itemLocation?: { city?: string; stateOrProvince?: string; country?: string };
}

/** eBay's official Browse API (app-only OAuth). Needs EBAY_CLIENT_ID + EBAY_CLIENT_SECRET. */
@Injectable()
export class EbayAdapter implements SourceAdapter {
  readonly name = 'ebay';
  private readonly log = new Logger(EbayAdapter.name);
  private token?: { value: string; expires: number };

  constructor(private readonly config: AppConfig) {}

  enabled() {
    return Boolean(this.config.get('EBAY_CLIENT_ID') && this.config.get('EBAY_CLIENT_SECRET'));
  }

  async search(q: SourceQuery): Promise<RawListing[]> {
    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
    url.searchParams.set('q', q.text);
    url.searchParams.set('limit', String(q.limit));
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${await this.accessToken()}`,
        'x-ebay-c-marketplace-id': this.config.get('EBAY_MARKETPLACE'),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`eBay search failed: HTTP ${res.status}`);
    const body = (await res.json()) as { itemSummaries?: EbayItem[] };
    return (body.itemSummaries ?? []).map((it) => ({
      source: 'ebay',
      externalId: it.itemId,
      url: it.itemWebUrl,
      title: it.title,
      description: it.shortDescription,
      price: it.price ? Number(it.price.value) : null,
      currency: it.price?.currency ?? 'CAD',
      imageUrl: it.image?.imageUrl ?? null,
      condition: /new/i.test(it.condition ?? '') ? 'new' : it.condition ? 'used' : 'unknown',
      location: [it.itemLocation?.city, it.itemLocation?.stateOrProvince ?? it.itemLocation?.country].filter(Boolean).join(', ') || null,
    }));
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.config.get('EBAY_CLIENT_ID')}:${this.config.get('EBAY_CLIENT_SECRET')}`).toString('base64');
    const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`eBay token request failed: HTTP ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
    this.log.log('got eBay app token');
    return this.token.value;
  }
}
