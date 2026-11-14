import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../common/config/app-config.service';
import { classifyTitle } from '../matching/classify';
import { RawListing, SourceAdapter, SourceQuery } from './source.adapter';

/** Spare parts and covers that mention a furniture word but aren't the furniture. */
const NOT_FURNITURE = /\b(cover|slipcover|legs?|feet|cushion cover|fittings?|parts?|frame for|insert|hardware|glass top)\b/i;

interface IkeaProduct {
  itemNo: string;
  name: string;
  typeName: string;
  pipUrl: string;
  mainImageUrl?: string;
  itemMeasureReferenceText?: string;
  validDesignText?: string;
  colors?: { name: string }[];
  salesPrice?: { numeral?: number; currencyCode?: string };
}

/**
 * IKEA products via the search service IKEA's own site uses (its robots.txt allows crawlers).
 * One search request per furniture type; we keep only the public listing basics.
 * Real sizes come later from the product page, only for pieces chosen for a layout.
 */
@Injectable()
export class IkeaAdapter implements SourceAdapter {
  readonly name = 'ikea';
  private readonly log = new Logger(IkeaAdapter.name);

  constructor(private readonly config: AppConfig) {}

  enabled() {
    return true;
  }

  async search(q: SourceQuery): Promise<RawListing[]> {
    const locale = this.config.get('IKEA_LOCALE'); // e.g. "ca/en"
    const url = new URL(`https://sik.search.blue.cdtapps.com/${locale}/search-result-page`);
    url.searchParams.set('q', q.text);
    url.searchParams.set('size', String(Math.min(24, q.limit * 2)));
    url.searchParams.set('types', 'PRODUCT');
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`IKEA search failed: HTTP ${res.status}`);
    const body = (await res.json()) as { searchResultPage?: { products?: { main?: { items?: { product?: IkeaProduct }[] } } } };
    const products = (body.searchResultPage?.products?.main?.items ?? []).map((i) => i.product).filter((p): p is IkeaProduct => !!p);

    return products
      .filter((p) => !NOT_FURNITURE.test(p.typeName) && classifyTitle(p.typeName) === q.type)
      .slice(0, q.limit)
      .map((p) => {
        const colours = (p.colors ?? []).map((c) => c.name).join(' ');
        return {
          source: 'ikea',
          externalId: p.itemNo,
          url: p.pipUrl,
          title: `${p.name} ${p.typeName}${colours ? `, ${colours}` : ''}`,
          // the measure text is sometimes "90x55 cm" (tables, rugs): the size parser picks it up
          description: [p.itemMeasureReferenceText, p.validDesignText].filter(Boolean).join(' '),
          price: p.salesPrice?.numeral ?? null,
          currency: p.salesPrice?.currencyCode ?? 'CAD',
          imageUrl: p.mainImageUrl ?? null,
          condition: 'new',
          location: null,
        } satisfies RawListing;
      });
  }
}

export const USER_AGENT = 'hey-jenna/0.1 (hackathon prototype; furniture matching)';
