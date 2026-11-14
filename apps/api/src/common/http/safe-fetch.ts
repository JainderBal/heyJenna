import { lookup } from 'dns/promises';
import { isIP } from 'net';

export class UnsafeUrlError extends Error {}

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];
function isPrivate(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  return PRIVATE_V4.some((r) => r.test(ip));
}

async function assertPublic(url: URL) {
  if (url.protocol !== 'https:') throw new UnsafeUrlError('Only https links are allowed');
  if (url.username || url.password) throw new UnsafeUrlError('Links with credentials are not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new UnsafeUrlError('Private host');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.some((a) => isPrivate(a.address))) throw new UnsafeUrlError('Link points to a private network address');
}

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  accept?: string;
}

/**
 * Fetches a URL a user gave us without letting it reach our own network (SSRF protection):
 * https only, public IPs only (checked again on every redirect), size and time limits.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<{ body: Buffer; contentType: string; finalUrl: string }> {
  const maxBytes = opts.maxBytes ?? 8 * 1024 * 1024;
  let url = new URL(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      headers: { 'user-agent': 'hey-jenna/0.1 (+link preview)', accept: opts.accept ?? '*/*' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, url);
      continue;
    }
    if (!res.ok) throw new Error(`Fetch failed with HTTP ${res.status}`);
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw new UnsafeUrlError('File is too large');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > maxBytes) throw new UnsafeUrlError('File is too large');
      chunks.push(Buffer.from(chunk));
    }
    return { body: Buffer.concat(chunks), contentType: res.headers.get('content-type') ?? '', finalUrl: url.toString() };
  }
  throw new UnsafeUrlError('Too many redirects');
}
