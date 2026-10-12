import type { Enums } from "@orgasport/db";

type Person = { first_name: string; last_name: string };

const initial = (s: string) => {
  const c = s.trim().charAt(0);
  return c ? `${c.toUpperCase()}.` : "";
};

/** One player as shown publicly, following the organizer's choice. */
export function publicPlayerName(p: Person, mode: Enums<"name_display">): string {
  if (mode === "initials") return `${initial(p.first_name)} ${initial(p.last_name)}`.trim();
  return `${p.first_name} ${p.last_name}`.trim();
}

/**
 * Short team label: its name if it has one (football), otherwise the players'
 * last names ("Dupont / Martin") or initials ("K. B. / J. M.").
 */
export function publicTeamLabel(
  team: { name: string | null; number: number },
  players: Person[],
  mode: Enums<"name_display">,
): string {
  if (team.name) return team.name;
  if (players.length === 0) return `#${team.number}`;
  return players
    .map((p) => (mode === "initials" ? publicPlayerName(p, mode) : p.last_name))
    .join(" / ");
}
