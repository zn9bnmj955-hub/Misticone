import type { NextRequest } from "next/server";
import { json, requireStaff } from "@/lib/tournament/http";
import { loadTournament } from "@/lib/tournament/load";

type Ctx = { params: Promise<{ code: string }> };

/** Full tournament state for the scoring table (staff only). */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const access = await requireStaff(code);
  if (!access.ok) return access.response;
  const loaded = await loadTournament(access.tournament.short_code, { secrets: true });
  if (!loaded) return json({ error: { code: "NOT_FOUND" } }, 404);
  const { meta, state, version } = loaded;
  return json({
    version,
    actor: {
      kind: access.actor.kind,
      label: access.actor.label,
      canManageAccess: access.actor.kind === "account" && access.actor.canManageAccess,
    },
    tournament: {
      id: meta.id,
      code: meta.short_code,
      name: meta.name,
      status: meta.status,
      sportSlug: meta.sport_slug,
      teamFormat: meta.team_format,
      startsAt: meta.starts_at,
      nameDisplay: meta.name_display,
      maxTeams: meta.max_teams,
      clubName: meta.club?.name ?? null,
      city: meta.city,
    },
    state,
  });
}
