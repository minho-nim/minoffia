import type { SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const ALLOW_SIGNUP = import.meta.env.VITE_ALLOW_SIGNUP === 'true';

let client: SupabaseClient | null = null;

/** 환경변수가 없으면 null(로컬 데모 모드). */
export async function getSupabase(): Promise<SupabaseClient | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return client;
}
