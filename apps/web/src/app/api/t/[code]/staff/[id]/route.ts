import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { json, requireStaff } from "@/lib/tournament/http";

type Ctx = { params: Promise<{ code: string; id: string }> };

/** Revokes a PIN or a staff member immediately. */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { code, id } = await params;
  const access = await requireStaff(code);
  if (!access.ok) return access.response;
  if (access.actor.kind !== "account" || !access.actor.canManageAccess) return json({ error: { code: "FORBIDDEN" } }, 403);
  await createAdminClient()
    .from("tournament_staff")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tournament_id", access.tournament.id)
    .neq("role", "organizer");
  return json({ ok: true });
}
