import type { Change, EngineState, Match, Round } from "@orgasport/engine";

/**
 * What deserves a notification, read from the changes the draw engine just
 * made. Pure: the same changes always give the same events (and the same
 * deduplication keys, so a retried action never notifies twice).
 */
export type NotifyEvent =
  | { kind: "your_turn"; key: string; matchId: string; teamIds: string[] }
  | { kind: "draw_published"; key: string; roundId: string; teamIds: string[] }
  | { kind: "score_validated"; key: string; matchId: string; teamIds: string[] };

const DONE = new Set(["done", "forfeit"]);

const teamsOf = (m: Match) => [...m.sideA, ...m.sideB];

export function eventsFromChanges(changes: Change[], after: EngineState): NotifyEvent[] {
  const out: NotifyEvent[] = [];
  const seen = new Set<string>();
  const push = (e: NotifyEvent) => {
    if (seen.has(e.key)) return;
    seen.add(e.key);
    out.push(e);
  };
  for (const c of changes) {
    if (c.entity === "match" && c.op !== "delete") {
      const m = after.matches[c.id] ?? (c.after as unknown as Match);
      const before = c.op === "update" ? (c.before as unknown as Partial<Match>) : null;
      // Ready = opponent known and venue assigned. A move to another venue notifies again.
      if (m.status === "ready" && m.venueId && m.sideA.length && m.sideB.length) {
        if (!before || before.status !== "ready" || before.venueId !== m.venueId) {
          push({ kind: "your_turn", key: `your_turn:${m.id}:${m.venueId}`, matchId: m.id, teamIds: teamsOf(m) });
        }
      }
      if (DONE.has(m.status) && m.scoreA !== null && m.scoreB !== null && before && !DONE.has(before.status ?? "")) {
        push({ kind: "score_validated", key: `score:${m.id}:${m.scoreA}-${m.scoreB}`, matchId: m.id, teamIds: teamsOf(m) });
      }
    }
    if (c.entity === "round" && c.op !== "delete") {
      const r = after.rounds[c.id] ?? (c.after as unknown as Round);
      const before = c.op === "update" ? (c.before as unknown as Partial<Round>) : null;
      if (r.drawnAt && (!before || !before.drawnAt)) {
        const teamIds = Object.values(after.matches)
          .filter((m) => m.roundId === r.id)
          .flatMap(teamsOf);
        if (teamIds.length) push({ kind: "draw_published", key: `draw:${r.id}:${r.seed ?? ""}`, roundId: r.id, teamIds: [...new Set(teamIds)] });
      }
    }
  }
  return out;
}
