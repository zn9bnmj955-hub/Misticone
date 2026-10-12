import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Change } from "@orgasport/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeCommand } from "./execute";
import { loadTournament, type LoadedTournament } from "./load";
import { registrationWindow, teamShape, validateRegistration, type RegistrationInput, type RegistrationIssue } from "./registration-rules";

export * from "./registration-rules";

export type RegisterResult =
  | { ok: true; teamId: string; number: number; status: "registered" | "waitlist"; tournament: LoadedTournament }
  | { ok: false; error: "not_found" | "closed" | "onsite_only" | "full" | "invalid" | "busy"; issues?: RegistrationIssue[] };

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Online registration: the team is created by the draw engine like any other
 * change (history, live updates, undo at the scoring table), then the private
 * part (contacts, licenses, account links) is written separately — it never
 * enters the engine state that public pages are built from.
 */
export async function registerOnline(
  code: string,
  input: RegistrationInput,
  opts: { userId?: string | null; deviceToken?: string | null } = {},
): Promise<RegisterResult> {
  const loaded = await loadTournament(code);
  if (!loaded) return { ok: false, error: "not_found" };
  const active = Object.values(loaded.state.teams).filter((t) => t.status !== "waitlist" && t.status !== "withdrawn").length;
  const window = registrationWindow(loaded.meta, active, Date.now());
  if (window === "closed" || window === "onsite_only" || window === "full") return { ok: false, error: window };

  const shape = teamShape(loaded.meta, loaded.sport);
  const issues = validateRegistration(input, shape, loaded.sport);
  if (issues.length) return { ok: false, error: "invalid", issues };

  const clientOpId = randomUUID();
  const result = await executeCommand({
    code,
    command: {
      type: "team.create",
      name: input.teamName || null,
      club: input.club || null,
      players: input.players.map((p) => ({ firstName: p.firstName, lastName: p.lastName })),
      source: "online",
    },
    clientOpId,
    actor: null,
    source: "online",
  });
  if (!result.ok) return { ok: false, error: result.status === 409 ? "busy" : "closed" };

  const created = result.changes.find((c): c is Extract<Change, { op: "create" }> => c.op === "create" && c.entity === "team");
  if (!created) return { ok: false, error: "busy" };
  const team = created.after as { id: string; number: number; status: string };

  const { error } = await createAdminClient().rpc("register_team_private", {
    p_team: team.id,
    p: {
      captain_name: input.captain.name,
      captain_phone: input.captain.phone ?? "",
      captain_email: input.captain.email ?? "",
      user_id: opts.userId ?? "",
      accepted_rules_at: new Date().toISOString(),
      device_token_hash: opts.deviceToken ? hashDeviceToken(opts.deviceToken) : "",
      players: input.players.map((p, i) => ({
        position: i + 1,
        license: p.license ?? "",
        category: p.category ?? "",
        // The account holder is the first player when they register their own team.
        user_id: i === 0 && opts.userId && input.selfIsFirstPlayer ? opts.userId : "",
      })),
    },
  });
  if (error) console.error("register_team_private failed", team.id, error.message);

  return {
    ok: true,
    teamId: team.id,
    number: team.number,
    status: team.status === "waitlist" ? "waitlist" : "registered",
    tournament: loaded,
  };
}
