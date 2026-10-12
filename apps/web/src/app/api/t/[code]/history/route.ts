import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { json, requireStaff } from "@/lib/tournament/http";

type Ctx = { params: Promise<{ code: string }> };

/** The latest actions, newest first, with who did them and whether they were undone. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const access = await requireStaff(code);
  if (!access.ok) return access.response;
  const { data } = await createAdminClient()
    .from("tournament_actions")
    .select("id, type, payload, actor_label, source, created_at, undone_at, undone_by_action, state_version")
    .eq("tournament_id", access.tournament.id)
    .order("id", { ascending: false })
    .limit(150);
  return json({ actions: data ?? [] });
}
