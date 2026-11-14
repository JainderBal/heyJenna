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

  /** IKEA search does best with short queries: colour + type, style word + type, type alone; merged. */
  async search(q: SourceQuery): Promise<RawListing[]> {
    const texts = q.parts
      ? [`${q.parts.colour} ${q.parts.typeText}`, `${q.parts.keyword} ${q.parts.typeText}`, q.parts.typeText]
      : [q.text];
    const seen = new Set<string>();
    const products: IkeaProduct[] = [];
    for (const text of [...new Set(texts.map((t) => t.trim()))]) {
      for (const p of await this.query(text, q.limit))
        if (!seen.has(p.itemNo) && !NOT_FURNITURE.test(p.typeName) && classifyTitle(p.typeName) === q.type) {
          seen.add(p.itemNo);
          products.push(p);
        }
    }
    return products
      .slice(0, q.limit * 2)
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

  private async query(text: string, limit: number): Promise<IkeaProduct[]> {
    const url = new URL(`https://sik.search.blue.cdtapps.com/${this.config.get('IKEA_LOCALE')}/search-result-page`);
    url.searchParams.set('q', text);
    url.searchParams.set('size', String(Math.min(24, limit * 2)));
    url.searchParams.set('types', 'PRODUCT');
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`IKEA search failed: HTTP ${res.status}`);
    const body = (await res.json()) as { searchResultPage?: { products?: { main?: { items?: { product?: IkeaProduct }[] } } } };
    return (body.searchResultPage?.products?.main?.items ?? []).map((i) => i.product).filter((p): p is IkeaProduct => !!p);
  }
}

export const USER_AGENT = 'hey-jenna/0.1 (hackathon prototype; furniture matching)';
