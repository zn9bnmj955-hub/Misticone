import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@orgasport/db";
import { env } from "@/lib/env";

/**
 * Anonymous client without cookies: reads only public data (RLS as "anon").
 * Safe to use inside cached functions.
 */
export function createPublicClient() {
  return createClient<Database>(env.supabaseUrl, env.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
