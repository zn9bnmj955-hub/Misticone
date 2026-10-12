import type { NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { json, requireStaff } from "@/lib/tournament/http";

type Ctx = { params: Promise<{ code: string }> };

/** Staff list (organizers only, PIN volunteers cannot manage access). */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const access = await requireStaff(code);
  if (!access.ok) return access.response;
  if (access.actor.kind !== "account") return json({ error: { code: "FORBIDDEN" } }, 403);
  const { data } = await createAdminClient()
    .from("tournament_staff")
    .select("id, role, label, user_id, created_at, revoked_at, pin_hash")
    .eq("tournament_id", access.tournament.id)
    .order("created_at");
  return json({ staff: (data ?? []).map(({ pin_hash, ...s }) => ({ ...s, hasPin: Boolean(pin_hash) })) });
}

const createSchema = z.object({ label: z.string().trim().min(1).max(60) });

/** Creates a 6-digit PIN for a volunteer. The PIN is shown once and stored hashed. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const access = await requireStaff(code);
  if (!access.ok) return access.response;
  if (access.actor.kind !== "account") return json({ error: { code: "FORBIDDEN" } }, 403);
  const body = createSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: { code: "BAD_REQUEST" } }, 400);
  const digits = new Uint32Array(1);
  crypto.getRandomValues(digits);
  const pin = String(digits[0]! % 1_000_000).padStart(6, "0");
  const admin = createAdminClient();
  const { data: hash } = await admin.rpc("hash_pin", { p_pin: pin });
  const { data, error } = await admin
    .from("tournament_staff")
    .insert({ tournament_id: access.tournament.id, role: "co_organizer", label: body.data.label, pin_hash: hash })
    .select("id, label")
    .single();
  if (error) return json({ error: { code: "SAVE_FAILED" } }, 500);
  return json({ staff: data, pin });
}
