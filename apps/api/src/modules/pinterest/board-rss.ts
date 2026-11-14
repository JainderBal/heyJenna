import { BadRequestException } from '@nestjs/common';
import { ImportedPin } from '@hey-jenna/contracts';

/** pinterest.com, www./regional subdomains, and regional domains: pinterest.ca, pinterest.co.uk, pinterest.com.au, ... */
const HOST = /^(?:[a-z]{2,3}\.|www\.)?pinterest\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;
/** First path segments that are Pinterest pages, not user names. */
const RESERVED = new Set([
  'pin', 'ideas', 'search', 'today', 'explore', 'business', 'settings', 'login', 'about', 'topics', 'news_hub', 'videos', 'shop', '_', 'oauth', 'resource',
]);

export interface BoardRef {
  /** The feed to fetch. */
  feedUrl: string;
  /** The board's page. */
  boardUrl: string;
}

/** Accepts https://www.pinterest.ca/user/board/ (or .../board.rss) and returns the board page + RSS feed; 400 otherwise. */
export function parseBoardUrl(raw: string): BoardRef {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new BadRequestException('boardUrl is not a valid link');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new BadRequestException('boardUrl must be an https link');
  const host = url.hostname.toLowerCase();
  if (!HOST.test(host)) throw new BadRequestException('boardUrl must be a Pinterest board link (pinterest.com or a regional domain)');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length > 0) parts[parts.length - 1] = parts[parts.length - 1].replace(/\.rss$/i, '');
  // a board is exactly /<user>/<board>; deeper paths are sections or pins, not accepted
  if (parts.length !== 2 || !parts.every(Boolean) || RESERVED.has(parts[0].toLowerCase())) {
    throw new BadRequestException('boardUrl must look like https://www.pinterest.com/<user>/<board>/');
  }
  const [user, board] = parts;
  if (![user, board].every((p) => /^[^/\s]+$/.test(p))) throw new BadRequestException('boardUrl is not a board link');
  const base = `https://${host}/${user}/${board}`;
  return { boardUrl: `${base}/`, feedUrl: `${base}.rss` };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Text of the first <tag>, with CDATA unwrapped and entities decoded. */
function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  if (!m) return null;
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(m[1]);
  return (cdata ? cdata[1] : decode(m[1])).trim();
}

/** Pin images arrive as /236x/ thumbnails; ask for /736x/. Only i.pinimg.com images are kept. */
export function upgradeImage(src: string): string | null {
  let u: URL;
  try {
    u = new URL(decode(src));
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== 'i.pinimg.com') return null;
  u.pathname = u.pathname.replace(/^\/236x\//, '/736x/');
  return u.toString();
}

export function looksLikeFeed(xml: string): boolean {
  return /<rss[\s>]/i.test(xml) && /<channel[\s>]/i.test(xml);
}

/** Small RSS reader for Pinterest board feeds. Items without a still image are skipped. */
export function parseBoardFeed(xml: string): { title: string; pins: ImportedPin[] } {
  const firstItem = xml.search(/<item[\s>]/i);
  const head = firstItem === -1 ? xml : xml.slice(0, firstItem);
  const title = tag(head, 'title') ?? 'Pinterest board';
  const pins: ImportedPin[] = [];
  const seen = new Set<string>();
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const item = m[0];
    const link = tag(item, 'link');
    const guid = tag(item, 'guid');
    const id = [link, guid].map((s) => /\/pin\/(\d+)/.exec(s ?? '')?.[1]).find(Boolean) ?? guid ?? link;
    if (!id || seen.has(id)) continue;
    const desc = tag(item, 'description') ?? '';
    const src = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(desc)?.[1] ?? /<media:(?:content|thumbnail)[^>]+url\s*=\s*["']([^"']+)["']/i.exec(item)?.[1];
    const imageUrl = src ? upgradeImage(src) : null;
    if (!imageUrl) continue;
    seen.add(id);
    const t = tag(item, 'title');
    pins.push({ id: id.slice(0, 64), title: t || null, imageUrl, link: link || null });
  }
  return { title, pins };
}
