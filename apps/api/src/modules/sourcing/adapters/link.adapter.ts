import { Injectable } from '@nestjs/common';
import { ListingSource } from '@hey-jenna/contracts';
import { safeFetch } from '../../../common/http/safe-fetch';
import { findPrice, RawListing } from './source.adapter';

/**
 * A listing the person pasted themselves. We fetch that one page once and read its
 * public preview tags (Open Graph / schema.org Product), like a chat app's link preview.
 */
@Injectable()
export class LinkAdapter {
  async read(url: string): Promise<RawListing> {
    const { body, finalUrl } = await safeFetch(url, { maxBytes: 3 * 1024 * 1024, accept: 'text/html' });
    const html = body.toString('utf8');
    const meta = (prop: string) => {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
      const m = re.exec(html);
      return m ? decode(m[1] ?? m[2]) : undefined;
    };
    const product = jsonLdProduct(html);
    const title = product?.name ?? meta('og:title') ?? /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? finalUrl;
    const description = product?.description ?? meta('og:description') ?? meta('description') ?? '';
    const priceText = product?.price ?? meta('product:price:amount') ?? meta('og:price:amount');
    return {
      source: sourceOf(finalUrl),
      externalId: finalUrl,
      url: finalUrl,
      title: decode(title),
      description,
      price: priceText ? Number(priceText) || null : findPrice(`${title} ${description}`),
      currency: product?.currency ?? meta('product:price:currency') ?? 'CAD',
      imageUrl: product?.image ?? meta('og:image') ?? null,
      condition: /used|pre-?owned|vintage/i.test(`${title} ${description}`) ? 'used' : 'unknown',
      location: null,
    };
  }
}

function sourceOf(url: string): ListingSource {
  const host = new URL(url).hostname;
  if (host.includes('ebay.')) return 'ebay';
  if (host.includes('kijiji.')) return 'kijiji';
  if (host.includes('facebook.')) return 'facebook';
  if (host.includes('ikea.')) return 'ikea';
  if (host.includes('etsy.')) return 'etsy';
  return 'link';
}

function jsonLdProduct(html: string): { name?: string; description?: string; image?: string; price?: string; currency?: string } | undefined {
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    try {
      const json = JSON.parse(block.replace(/^<script[^>]*>|<\/script>$/gi, ''));
      const items = (Array.isArray(json) ? json : json['@graph'] ?? [json]) as Record<string, any>[];
      const p = items.find((i) => [i['@type']].flat().includes('Product'));
      if (!p) continue;
      const offer = [p.offers].flat()[0] ?? {};
      return {
        name: p.name, description: p.description,
        image: [p.image].flat()[0]?.url ?? [p.image].flat()[0],
        price: offer.price != null ? String(offer.price) : undefined, currency: offer.priceCurrency,
      };
    } catch {
      /* ignore broken JSON-LD */
    }
  }
  return undefined;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
