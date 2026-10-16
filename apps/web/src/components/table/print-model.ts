import { matchesOfRound, roundsOf, type Bracket, type EngineState, type Match, type Round } from "@orgasport/engine";

/**
 * Printed draw sheets, laid out like the federation result pages ("ppf"):
 * one big table per round (Terrain | Équipe | Équipe | Score), newest round
 * first, players "NOM PRÉNOM" in capitals with their club or "(N.H.)", losing
 * side greyed, "**" while the game is not played, "Office" facing a team
 * qualified without playing. Pure: computed from the state on this device,
 * so it prints without network.
 */

export interface PrintSide {
  number: number;
  players: string[];
  /** "(0340901/BOULE DU CAP AGDE)", "(N.H.)" or null. */
  affiliation: string | null;
  lost: boolean;
}

export interface PrintRow {
  id: string;
  venue: string;
  a: PrintSide | null;
  /** null = "Office" / exempt (no opponent). */
  b: PrintSide | null;
  score: string;
}

export interface PrintSection {
  bracket: Bracket;
  round: Round;
  /** The team facing nobody is "Office" in a cadrage round, "Exempt" before it. */
  office: boolean;
  rows: PrintRow[];
}

const BRACKETS: Bracket[] = ["main", "consolation", "consolation_c"];
const PLAYED = new Set(["done", "forfeit", "bye"]);

/** "(n°/CLUB)" when every player has the same club, "(N.H.)" when they differ. */
export function teamAffiliation(state: EngineState, teamId: string): string | null {
  const clubs = Object.values(state.players)
    .filter((p) => p.teamId === teamId)
    .map((p) => p.club)
    .filter((c): c is NonNullable<typeof c> => Boolean(c && (c.number || c.name)));
  if (clubs.length > 0) {
    const keys = new Set(clubs.map((c) => `${c.number}/${c.name}`.toUpperCase()));
    if (keys.size > 1) return "(N.H.)";
    const c = clubs[0]!;
    return `(${[c.number, c.name.toUpperCase()].filter(Boolean).join("/")})`;
  }
  const club = state.teams[teamId]?.club;
  return club ? `(${club.toUpperCase()})` : null;
}

function side(state: EngineState, match: Match, ids: string[], which: "A" | "B"): PrintSide | null {
  const id = ids[0];
  const team = id ? state.teams[id] : undefined;
  if (!id || !team) return null;
  const players = Object.values(state.players)
    .filter((p) => p.teamId === id)
    .sort((x, y) => x.position - y.position)
    .map((p) => `${p.lastName} ${p.firstName}`.trim().toUpperCase());
  const lost = PLAYED.has(match.status) && match.winner !== null && match.winner !== "draw" && match.winner !== which;
  return { number: team.number, players: players.length ? players : [team.name?.toUpperCase() ?? `N° ${team.number}`], affiliation: teamAffiliation(state, id), lost };
}

function score(match: Match): string {
  if (match.status === "bye" && (match.sideB.length === 0 || match.sideA.length === 0)) return match.scoreA !== null && match.scoreB !== null ? `${match.scoreA} - ${match.scoreB}` : "";
  if (!PLAYED.has(match.status) || match.scoreA === null || match.scoreB === null) return "**";
  return `${match.scoreA} - ${match.scoreB}`;
}

/** Rounds to print: the current one(s) of each bracket, or all of them; newest first. */
export function printDrawSections(state: EngineState, which: "current" | "all", venueLabels?: Map<string, string>): PrintSection[] {
  const venues = venueLabels ?? new Map(Object.values(state.venues).map((v) => [v.id, v.label]));
  const sections: PrintSection[] = [];
  for (const bracket of BRACKETS) {
    let rounds = roundsOf(state, bracket).filter((r) => r.status !== "pending");
    if (which === "current" && rounds.length > 0) {
      const open = rounds.filter((r) => r.status !== "finished");
      rounds = open.length > 0 ? open : [rounds[rounds.length - 1]!];
    }
    for (const round of [...rounds].reverse()) {
      const rows = matchesOfRound(state, round.id).map((m) => {
        const a = side(state, m, m.sideA, "A");
        const b = side(state, m, m.sideB, "B");
        return { id: m.id, venue: m.venueId ? (venues.get(m.venueId) ?? "") : "", a: a ?? b, b: a ? b : null, score: score(m) };
      });
      sections.push({ bracket, round, office: round.kind === "cadrage", rows });
    }
  }
  return sections;
}
