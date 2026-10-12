"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@orgasport/db";
import { env } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function getBrowserClient() {
  client ??= createBrowserClient<Database>(env.supabaseUrl, env.supabaseKey);
  return client;
}
