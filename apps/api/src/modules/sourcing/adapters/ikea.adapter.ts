import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../common/config/app-config.service';
import { colourWordLab, COLOUR_WORDS } from '../../style/analysis/colour-names';
import { classifyTitle } from '../matching/classify';
import { RawListing, SourceAdapter, SourceQuery } from './source.adapter';

/** Spare parts and covers that mention a furniture word but aren't the furniture. */
const NOT_FURNITURE = /\b(cover|slipcover|legs?|feet|cushion cover|fittings?|parts?|frame for|insert|hardware|glass top)\b/i;
/** Ranges that don't belong in a grown-up living room. */
const WRONG_RANGE = /child|kid|baby|junior|outdoor|garden|gaming|pet/i;

interface IkeaVariant {
  id: string;
  pipUrl: string;
  imageUrl?: string;
  imageAlt?: string;
  name: string;
  typeName: string;
}

interface IkeaProduct {
  itemNo: string;
  businessStructure?: { homeFurnishingBusinessName?: string; productAreaName?: string };
  gprDescription?: { variants?: IkeaVariant[] };
  name: string;
  typeName: string;
  pipUrl: string;
  mainImageUrl?: string;
  itemMeasureReferenceText?: string;
  validDesignText?: string;
  colors?: { name: string; hex?: string }[];
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

  /** IKEA search does best with short queries: colour + type, style word + type, dial material + type, dial shape + type, type alone; merged. */
  async search(q: SourceQuery): Promise<RawListing[]> {
    const texts = q.parts
      ? [`${q.parts.colour} ${q.parts.typeText}`, `${q.parts.keyword} ${q.parts.typeText}`, ...(q.parts.material ? [`${q.parts.material} ${q.parts.typeText}`] : []), ...(q.parts.shape ? [`${q.parts.shape} ${q.parts.typeText}`] : []), q.parts.typeText]
      : [q.text];
    const seen = new Set<string>();
    const products: IkeaProduct[] = [];
    for (const text of [...new Set(texts.map((t) => t.trim()))]) {
      for (const p of await this.query(text, q.limit))
        if (!seen.has(p.itemNo) && !NOT_FURNITURE.test(p.typeName) && !this.wrongRange(p, p.businessStructure?.homeFurnishingBusinessName) && classifyTitle(p.typeName) === q.type) {
          seen.add(p.itemNo);
          products.push(p);
        }
    }
    // each product and its colour variants are separate candidates: scoring picks the colour that suits the board
    return products.slice(0, q.limit * 2).flatMap((p) => [this.toListing(p), ...this.variantsOf(p)]);
  }

  private wrongRange(p: { typeName: string }, area?: string) {
    return WRONG_RANGE.test(p.typeName) || (!!area && WRONG_RANGE.test(area));
  }

  private toListing(p: IkeaProduct): RawListing {
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
      colourHexes: (p.colors ?? []).filter((c) => c.hex).map((c) => `#${c.hex!.toUpperCase()}`),
    };
  }

  /** Other colours of the same product ("Samsala dark blue"). Price is the main product's until the page is read. */
  private variantsOf(p: IkeaProduct): RawListing[] {
    return (p.gprDescription?.variants ?? []).slice(0, 6).filter((v) => !this.wrongRange(v)).map((v) => {
      const colourText = (v.imageAlt ?? '').split(',').slice(1).join(' ').toLowerCase(); // "…, Samsala dark blue"
      const words = COLOUR_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(colourText));
      return {
        ...this.toListing(p),
        externalId: v.id.replace(/^s/, ''),
        url: v.pipUrl,
        title: `${v.name} ${v.typeName}${colourText ? `, ${colourText}` : ''}`,
        imageUrl: v.imageUrl ?? null,
        colourHexes: words.length ? words.map(wordHex) : undefined,
      };
    });
  }

  /** At most 4 IKEA requests in flight across the whole app; retry twice with backoff on errors / 429 / 5xx. */
  private async query(text: string, limit: number): Promise<IkeaProduct[]> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await gate(() => this.queryOnce(text, limit));
      } catch (e) {
        if (attempt >= 2) throw e;
        this.log.warn(`IKEA search "${text}" failed (${(e as Error).message}); retrying`);
        await new Promise((r) => setTimeout(r, 600 * 3 ** attempt));
      }
    }
  }

  private async queryOnce(text: string, limit: number): Promise<IkeaProduct[]> {
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

/** A colour word's reference colour as #RRGGBB. */
function wordHex(word: string): string {
  const [L, a, b] = colourWordLab(word)!;
  // Lab → sRGB
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const f = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const [x, y, z] = [f(fx) * 0.95047, f(fy), f(fz) * 1.08883];
  const lin = [x * 3.2406 - y * 1.5372 - z * 0.4986, -x * 0.9689 + y * 1.8758 + z * 0.0415, x * 0.0557 - y * 0.204 + z * 1.057];
  const g = (c: number) => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
  return '#' + lin.map((c) => g(c).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** A tiny shared limiter: be polite to IKEA's servers and avoid being rate-limited. */
let inFlight = 0;
const waiting: (() => void)[] = [];
async function gate<T>(fn: () => Promise<T>, max = 4): Promise<T> {
  if (inFlight >= max) await new Promise<void>((r) => waiting.push(r));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}
