import { BadGatewayException, Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { ImportBoardResponse, PinterestBoard, PinterestPin } from '@hey-jenna/contracts';
import { z } from 'zod';
import { AppConfig } from '../../common/config/app-config.service';
import { safeFetch, UnsafeUrlError } from '../../common/http/safe-fetch';
import { looksLikeFeed, parseBoardFeed, parseBoardUrl } from './board-rss';

const API = 'https://api.pinterest.com/v5';

const Image = z.object({ url: z.string().url(), width: z.number(), height: z.number() });
const RawBoards = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().nullish(), pin_count: z.number().nullish() })),
  bookmark: z.string().nullish(),
});
const RawPins = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullish(),
      link: z.string().nullish(),
      media: z.object({ images: z.record(Image).optional() }).nullish(),
    }),
  ),
  bookmark: z.string().nullish(),
});

/** Pinterest API v5 with one per-deployment token (no OAuth yet). Read-only; no scraping. */
@Injectable()
export class PinterestService {
  constructor(private readonly config: AppConfig) {}

  async boards(bookmark?: string) {
    const raw = RawBoards.parse(await this.get('/boards', bookmark));
    const items: PinterestBoard[] = raw.items.map((b) => ({
      id: b.id, name: b.name, description: b.description ?? null, pinCount: b.pin_count ?? null,
    }));
    return { items, bookmark: raw.bookmark ?? null };
  }

  async pins(boardId: string, bookmark?: string) {
    const raw = RawPins.parse(await this.get(`/boards/${encodeURIComponent(boardId)}/pins`, bookmark));
    const items: PinterestPin[] = [];
    for (const p of raw.items) {
      const images = p.media?.images ?? {};
      const img = images['600x'] ?? images['1200x'] ?? images.originals ?? Object.values(images)[0];
      if (!img) continue; // videos / unsupported pins have no still image
      items.push({ id: p.id, title: p.title || null, imageUrl: img.url, size: { width: img.width, height: img.height }, link: p.link || null });
    }
    return { items, bookmark: raw.bookmark ?? null };
  }

  /** Public board through its RSS feed: no token needed. */
  async importBoard(boardUrl: string): Promise<ImportBoardResponse> {
    const ref = parseBoardUrl(boardUrl);
    let xml: string;
    try {
      // safeFetch has no host allowlist (https + public IPs only), so Pinterest hosts need no extra rule.
      const res = await safeFetch(ref.feedUrl, { accept: 'application/rss+xml, application/xml, text/xml', maxBytes: 4 * 1024 * 1024 });
      xml = res.body.toString('utf8');
    } catch (e) {
      if (e instanceof UnsafeUrlError) throw new BadGatewayException('Pinterest feed could not be fetched safely');
      if (/HTTP (404|403|410)\b/.test((e as Error).message)) throw new NotFoundException('Board not found, or it is private');
      throw new BadGatewayException('Pinterest feed could not be fetched');
    }
    if (!looksLikeFeed(xml)) throw new NotFoundException('Board not found, or it is private');
    const feed = parseBoardFeed(xml);
    return { board: { title: feed.title, url: ref.boardUrl }, pins: feed.pins };
  }

  private async get(path: string, bookmark?: string): Promise<unknown> {
    const token = this.config.get('PINTEREST_ACCESS_TOKEN');
    if (!token) throw new NotImplementedException('Pinterest is not configured: set PINTEREST_ACCESS_TOKEN');
    const url = new URL(API + path);
    url.searchParams.set('page_size', '50');
    if (bookmark) url.searchParams.set('bookmark', bookmark);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new BadGatewayException(`Pinterest answered HTTP ${res.status}`);
    return res.json();
  }
}
