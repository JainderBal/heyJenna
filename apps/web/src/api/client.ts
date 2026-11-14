/**
 * Thin fetch wrapper for the hey jenna API. In dev, Vite proxies /api → http://localhost:3000
 * (prefix stripped), so every path here is the API path with /api in front.
 */
const API_BASE = '/api';

/** AUTH_MODE=dev on the API: who we are. Override with localStorage `hj-dev-user` to test as someone else. */
export function devUser(): string {
  try {
    return localStorage.getItem('hj-dev-user') || 'dev-user';
  } catch {
    return 'dev-user';
  }
}

/** Any non-2xx answer. `message` is the API's own message when it sends one (Nest: `{statusCode, message, error}`). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export const isApiError = (e: unknown, status?: number): e is ApiError =>
  e instanceof ApiError && (status === undefined || e.status === status);

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON body (objects) or a FormData (multipart; the browser sets the boundary). */
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

/** `/rooms/1` + {a: 1} → `/api/rooms/1?a=1`. Paths that already start with /api are left alone. */
export function apiUrl(path: string, query?: Query): string {
  const base = path.startsWith(API_BASE + '/') ? path : API_BASE + (path.startsWith('/') ? path : '/' + path);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', 'x-dev-user': devUser() };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(path, opts.query), { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, "Can't reach the hey jenna API. Is it running (npm run dev)?");
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = text;
  if (text && (res.headers.get('content-type') ?? '').includes('json')) {
    try {
      data = JSON.parse(text);
    } catch {
      /* leave as text */
    }
  }
  if (!res.ok) throw new ApiError(res.status, messageOf(data) ?? `${res.status} ${res.statusText}`, data);
  return data as T;
}

/**
 * A binary answer (render PNG, GLB). `<img src>` can't send the login header, so files behind auth
 * are fetched here and shown through an object URL.
 */
export async function apiBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(apiUrl(path), { headers: { 'x-dev-user': devUser() }, signal });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  return res.blob();
}

function messageOf(data: unknown): string | null {
  if (typeof data === 'string') return data.trim() ? data.slice(0, 300) : null;
  if (data && typeof data === 'object' && 'message' in data) {
    const { message: m, problems } = data as { message: unknown; problems?: unknown };
    // layout edits refuse a spot with {message, problems: [...]}
    const why = Array.isArray(problems) && problems.length ? `: ${problems.join('; ')}` : '';
    if (Array.isArray(m)) return m.join('; ');
    if (typeof m === 'string') return m + why;
  }
  return null;
}

/** An error → one line for a toast. */
export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
