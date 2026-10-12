import type { NextRequest } from "next/server";
import { z } from "zod";
import { undoAction } from "@/lib/tournament/execute";
import { json, requireStaff } from "@/lib/tournament/http";

type Ctx = { params: Promise<{ code: string }> };
const schema = z.object({ actionId: z.number().int().positive(), clientOpId: z.string().uuid() });

export async function POST(request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const access = await requireStaff(code);
  if (!access.ok) return access.response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: { code: "BAD_REQUEST" } }, 400);
  const res = await undoAction({ code: access.tournament.short_code, actionId: body.data.actionId, clientOpId: body.data.clientOpId, actor: access.actor });
  if (!res.ok) return json({ error: res.error }, res.status);
  return json(res);
}
