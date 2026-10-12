"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { matchesOfRound, type EngineState, type Match } from "@orgasport/engine";
import { getSport, venueLabel } from "@orgasport/sports";
import { getMessages } from "@/i18n";
import { formatDay, formatTime } from "@/lib/format";
import { currentRounds, standings } from "@/terrain/view-model";
import type { TableTournament } from "./store";
import { Btn, Panel, roundName, sideName, teamMap } from "./ui";

type Doc = "draw" | "sheets" | "standings" | "teams";

/**
 * Backup printing from the data already on this device: works without
 * network. "Save as PDF" in the print dialog gives the PDF.
 */
export function PrintTab({ state, tournament }: { state: EngineState; tournament: TableTournament }) {
  const t = getMessages().table.print;
  const [doc, setDoc] = useState<Doc | null>(null);

  useEffect(() => {
    if (!doc) return;
    const root = document.documentElement;
    root.classList.add("printing");
    const done = () => {
      root.classList.remove("printing");
      setDoc(null);
    };
    window.addEventListener("afterprint", done, { once: true });
    const id = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(id);
      window.removeEventListener("afterprint", done);
      root.classList.remove("printing");
    };
  }, [doc]);

  const docs: { id: Doc; label: string }[] = [
    { id: "draw", label: t.draw },
    { id: "sheets", label: t.sheets },
    { id: "standings", label: t.standings },
    { id: "teams", label: t.teams },
  ];
  return (
    <div className="grid gap-4">
      <Panel>
        <p className="text-ink-soft">{t.intro}</p>
        <div className="flex flex-wrap gap-2">
          {docs.map((d) => (
            <Btn key={d.id} tone="primary" onClick={() => setDoc(d.id)}>
              🖨 {d.label}
            </Btn>
          ))}
        </div>
      </Panel>
      {doc && createPortal(<PrintDoc doc={doc} state={state} tournament={tournament} />, document.body)}
    </div>
  );
}

function PrintDoc({ doc, state, tournament }: { doc: Doc; state: EngineState; tournament: TableTournament }) {
  const m = getMessages();
  const teams = useMemo(() => teamMap(state), [state]);
  const sport = getSport(tournament.sportSlug);
  const noun = sport ? venueLabel(sport) : "Terrain";
  const venues = new Map(Object.values(state.venues).map((v) => [v.id, v.label]));
  const players = (teamId: string) =>
    Object.values(state.players)
      .filter((p) => p.teamId === teamId)
      .sort((a, b) => a.position - b.position)
      .map((p) => `${p.firstName} ${p.lastName}`)
      .join(", ");
  const header = (
    <header style={{ borderBottom: "2px solid #000", marginBottom: "4mm", paddingBottom: "2mm" }}>
      <strong style={{ fontSize: "16pt" }}>{tournament.name}</strong> · {tournament.code} · {formatDay(tournament.startsAt)} · imprimé à {formatTime(new Date().toISOString())}
    </header>
  );
  const box = { display: "inline-block", width: "18mm", height: "12mm", border: "2px solid #000", verticalAlign: "middle" } as const;

  let body: React.ReactNode;
  if (doc === "draw") {
    const rounds = [...currentRounds(state, "main"), ...currentRounds(state, "consolation")];
    body = rounds.map((r) => (
      <section key={r.id} style={{ breakInside: "avoid" }}>
        <h2>{roundName(state, r)}</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11pt" }}>
          <tbody>
            {matchesOfRound(state, r.id).map((x) => (
              <tr key={x.id} style={{ borderBottom: "1px solid #999" }}>
                <td style={{ width: "18mm", fontWeight: 900, fontSize: "14pt" }}>{x.venueId ? venues.get(x.venueId) : ""}</td>
                <td>{sideName(teams, x.sideA)}</td>
                <td style={{ width: "12mm", textAlign: "center" }}>{x.scoreA ?? ""}</td>
                <td>{x.status === "bye" ? m.terrain.status.bye : sideName(teams, x.sideB)}</td>
                <td style={{ width: "12mm", textAlign: "center" }}>{x.scoreB ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    ));
  } else if (doc === "sheets") {
    const list: Match[] = Object.values(state.matches)
      .filter((x) => ["waiting_venue", "ready", "playing", "pending", "score_submitted", "disputed"].includes(x.status) && x.sideA.length && x.sideB.length)
      .sort((a, b) => (state.venues[a.venueId ?? ""]?.position ?? 999) - (state.venues[b.venueId ?? ""]?.position ?? 999));
    body = list.map((x) => (
      <section key={x.id} style={{ border: "2px solid #000", padding: "5mm", marginBottom: "6mm", breakInside: "avoid", height: "125mm" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14pt" }}>
          <strong>{m.table.print.sheetTitle}</strong>
          <span>{roundName(state, state.rounds[x.roundId]!)}</span>
          <strong style={{ fontSize: "20pt" }}>
            {noun} {x.venueId ? venues.get(x.venueId) : "____"}
          </strong>
        </div>
        {(["A", "B"] as const).map((side) => {
          const ids = side === "A" ? x.sideA : x.sideB;
          return (
            <div key={side} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8mm" }}>
              <div>
                <div style={{ fontSize: "18pt", fontWeight: 900 }}>{sideName(teams, ids)}</div>
                <div style={{ fontSize: "11pt" }}>{ids.map(players).join(" — ")}</div>
              </div>
              <span style={box} />
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "14mm", fontSize: "10pt" }}>
          <span>{m.table.print.signature} ________________</span>
          <span>{m.table.print.signature} ________________</span>
        </div>
      </section>
    ));
  } else if (doc === "standings") {
    body = standings(state, m).map((b) => (
      <section key={b.title} style={{ breakInside: "avoid" }}>
        <h2>{b.title}</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11pt" }}>
          <tbody>
            {b.rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #999" }}>
                <td style={{ width: "12mm", fontWeight: 900 }}>{r.rank}</td>
                <td>{sideName(teams, [r.id])}</td>
                <td>{r.stats.wins} V</td>
                <td>{r.stats.diff > 0 ? `+${r.stats.diff}` : r.stats.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    ));
  } else {
    body = (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11pt" }}>
        <tbody>
          {Object.values(state.teams)
            .sort((a, b) => a.number - b.number)
            .map((team) => (
              <tr key={team.id} style={{ borderBottom: "1px solid #999" }}>
                <td style={{ width: "12mm", fontWeight: 900 }}>{team.number}</td>
                <td>{players(team.id)}</td>
                <td>{team.club ?? ""}</td>
                <td>{team.status}</td>
                <td>{state.teamSecrets[team.id]?.code ?? ""}</td>
              </tr>
            ))}
        </tbody>
      </table>
    );
  }
  return (
    <div id="print-root" style={{ fontFamily: "Arial, sans-serif", color: "#000", background: "#fff", padding: "10mm" }}>
      {header}
      {body}
    </div>
  );
}
