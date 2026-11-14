import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  AUTH_MODE: z.enum(['dev', 'supabase']).default('dev'),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().default('moodboards'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  SOURCES: z.string().default('ikea,ebay,web'),
  /** IKEA country/language, as in ikea.com/ca/en. */
  IKEA_LOCALE: z.string().regex(/^[a-z]{2}\/[a-z]{2}$/).default('ca/en'),
  EBAY_CLIENT_ID: z.string().optional(),
  EBAY_CLIENT_SECRET: z.string().optional(),
  EBAY_MARKETPLACE: z.string().default('EBAY_CA'),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  PYTHON_BIN: z.string().default('python3'),
  /** Shared secret render workers send in x-worker-token. Unset = worker routes are off. */
  WORKER_TOKEN: z.string().min(16).optional(),
  /** Browser origins allowed to call the API (comma-separated), e.g. the React dev server. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** Comment line sent on idle SSE streams so proxies keep them open. */
  SSE_HEARTBEAT_MS: z.coerce.number().int().min(1000).default(20_000),
  /** In-process runner for the general jobs queue (e.g. background product searches). */
  JOBS_RUNNER: z.enum(['on', 'off']).default('on'),
  JOBS_POLL_MS: z.coerce.number().int().min(100).default(1000),
  JOBS_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  /** Hosts 3D models (GLB) may be fetched from, same rule as the render worker's MODEL_HOSTS. */
  MODEL_HOSTS: z.string().default('web-api.ikea.com'),
});
export type Env = z.infer<typeof Env>;

/** "a, b,,c" → ["a", "b", "c"] */
export function csv(value: string): string[] {
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

/** Used by ConfigModule: empty strings count as "not set", then the shape is checked. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''));
  const env = Env.parse(cleaned);
  if (env.AUTH_MODE === 'supabase' && !env.SUPABASE_URL) throw new Error('AUTH_MODE=supabase needs SUPABASE_URL');
  if (env.STORAGE_DRIVER === 'supabase' && !(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY))
    throw new Error('STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  return env;
}
