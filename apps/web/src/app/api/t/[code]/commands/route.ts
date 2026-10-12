import type { NextRequest } from "next/server";
import { commandRequestSchema } from "@/lib/tournament/command-schema";
import { executeCommand } from "@/lib/tournament/execute";
import { json, rateLimit, requireStaff } from "@/lib/tournament/http";

type Ctx = { params: Promise<{ code: string }> };

/** Applies one organizer action (idempotent by clientOpId). */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const access = await requireStaff(code);
  if (!access.ok) return access.response;
  if (!(await rateLimit(`cmd:${access.tournament.id}`, 600, 60))) return json({ error: { code: "RATE_LIMITED" } }, 429);
  const body = commandRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: { code: "BAD_REQUEST", details: { issue: body.error.issues[0]?.path.join(".") ?? "" } } }, 400);
  const res = await executeCommand({
    code: access.tournament.short_code,
    command: body.data.command,
    clientOpId: body.data.clientOpId,
    at: body.data.at,
    actor: access.actor,
  });
  if (!res.ok) return json({ error: res.error }, res.status);
  return json(res);
}
