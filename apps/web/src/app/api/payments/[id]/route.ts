import type { NextRequest } from "next/server";
import { UUID_RE } from "@/lib/payments/urls";
import { createClient } from "@/lib/supabase/server";
import { json } from "@/lib/tournament/http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Status of a payment, for the "payment being confirmed" screen. Members of
 * the club only (RLS on payments). Read-only: it never publishes anything.
 */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return json({ error: { code: "NOT_FOUND" } }, 404);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return json({ error: { code: "UNAUTHORIZED" } }, 401);
  const { data } = await supabase.from("payments").select("status, tournaments (status, short_code)").eq("id", id).maybeSingle();
  if (!data) return json({ error: { code: "NOT_FOUND" } }, 404);
  const published = Boolean(data.tournaments && data.tournaments.status !== "draft");
  return json({ status: data.status, published, code: published ? (data.tournaments?.short_code ?? null) : null });
}
