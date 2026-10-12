import type { NextRequest } from "next/server";
import { isShortCode, normalizeShortCode } from "@orgasport/engine";
import { buildTeamViews } from "@/terrain/view-model";
import { loadTournament } from "@/lib/tournament/load";
import { renderConfirmationPage } from "@/terrain/registration";

type Ctx = { params: Promise<{ code: string }> };

/** Confirmation after an online registration (public information only). */
export async function GET(request: NextRequest, { params }: Ctx) {
  const code = normalizeShortCode((await params).code);
  const loaded = isShortCode(code) ? await loadTournament(code) : null;
  if (!loaded) return new Response("Not found", { status: 404 });
  const number = Number(request.nextUrl.searchParams.get("equipe"));
  const team = Number.isInteger(number) ? Object.values(loaded.state.teams).find((t) => t.number === number) : undefined;
  const views = buildTeamViews(loaded.state, loaded.meta.name_display);
  const waitlist = Object.values(loaded.state.teams)
    .filter((t) => t.status === "waitlist")
    .sort((a, b) => a.number - b.number);
  const position = team?.status === "waitlist" ? waitlist.findIndex((t) => t.id === team.id) + 1 : null;
  const body = renderConfirmationPage({
    meta: loaded.meta,
    sport: loaded.sport,
    team: team ? { number: team.number, status: team.status, label: views.get(team.id)?.label ?? "" } : null,
    waitlistPosition: position,
  });
  return new Response(body, {
    status: team ? 200 : 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
