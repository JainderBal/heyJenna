/// <reference types="vite/client" />

/** Build-time settings (see apps/web/.env.example). */
interface ImportMetaEnv {
  /** The API's base URL, e.g. https://api.heyjenna.app. Default `/api` (the Vite dev proxy / desktop app). */
  readonly VITE_API_URL?: string;
  /** Supabase project URL. With VITE_SUPABASE_ANON_KEY it turns on the sign-in screen. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (public) key. Never the service-role key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
