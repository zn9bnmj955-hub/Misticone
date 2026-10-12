import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@orgasport/db";
import { env } from "@/lib/env";

/**
 * Service-role client: bypasses RLS. Only for trusted server code (public
 * tournament pages with name masking, Stripe webhook, notifications).
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient<Database>(env.supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
