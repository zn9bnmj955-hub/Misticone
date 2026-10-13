"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type EmailFallbackResult = { ok: true } | { ok: false; error: "invalid" | "auth" | "server" };

/** Email fallback for the signed-in account (`profiles.notifications_opt_in`, RLS: own row only). */
export async function setEmailFallback(on: unknown): Promise<EmailFallbackResult> {
  const parsed = z.boolean().safeParse(on);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { ok: false, error: "auth" };
  const { error } = await supabase.from("profiles").update({ notifications_opt_in: parsed.data }).eq("id", userId);
  return error ? { ok: false, error: "server" } : { ok: true };
}
