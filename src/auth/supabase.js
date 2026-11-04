import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://ztqwdwnauffdsqvgnqpr.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_JQsg1hQ_E7Ohmlh5KgU65Q__iQdf19X';

const envUrl =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ||
  DEFAULT_SUPABASE_URL;

const envAnonKey =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  DEFAULT_SUPABASE_ANON_KEY;

export const SUPABASE_URL = envUrl;
export const SUPABASE_ANON_KEY = envAnonKey;

export const supabase =
  envUrl && envAnonKey
    ? createClient(envUrl, envAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'afterground_supabase_auth'
        }
      })
    : null;

export function isSupabaseConfigured() {
  return Boolean(supabase);
}
