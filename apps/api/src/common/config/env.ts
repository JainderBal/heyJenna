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
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  SOURCES: z.string().default('mock,ebay,web'),
  EBAY_CLIENT_ID: z.string().optional(),
  EBAY_CLIENT_SECRET: z.string().optional(),
  EBAY_MARKETPLACE: z.string().default('EBAY_CA'),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  PYTHON_BIN: z.string().default('python3'),
});
export type Env = z.infer<typeof Env>;

/** Used by ConfigModule: empty strings count as "not set", then the shape is checked. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''));
  const env = Env.parse(cleaned);
  if (env.AUTH_MODE === 'supabase' && !env.SUPABASE_URL) throw new Error('AUTH_MODE=supabase needs SUPABASE_URL');
  if (env.STORAGE_DRIVER === 'supabase' && !(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY))
    throw new Error('STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  return env;
}
