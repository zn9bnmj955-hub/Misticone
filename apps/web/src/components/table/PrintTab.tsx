"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { type EngineState, type Match } from "@orgasport/engine";
import { getSport, venueLabel } from "@orgasport/sports";
import { fmt, getMessages } from "@/i18n";
import { formatDay, formatTime } from "@/lib/format";
import { standings } from "@/terrain/view-model";
import { printDrawSections, type PrintSide } from "./print-model";
import type { TableTournament } from "./store";
import { Btn, Panel, roundName, sideName, teamMap } from "./ui";

type Doc = "draw" | "rounds" | "sheets" | "standings" | "teams";

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
    { id: "rounds", label: t.allRounds },
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
    <header style={{ borderBottom: "2px solid var(--os-paper-ink)", marginBottom: "4mm", paddingBottom: "2mm" }}>
      <strong style={{ fontSize: "16pt" }}>{tournament.name}</strong> · {tournament.code} · {formatDay(tournament.startsAt)} · imprimé à {formatTime(new Date().toISOString())}
    </header>
  );
  const box = { display: "inline-block", width: "18mm", height: "12mm", border: "2px solid var(--os-paper-ink)", verticalAlign: "middle" } as const;

  let body: React.ReactNode;
  if (doc === "draw" || doc === "rounds") {
    const p = m.table.print;
    const sections = printDrawSections(state, doc === "draw" ? "current" : "all", venues);
    const several = new Set(sections.map((x) => x.bracket)).size > 1;
    const cell = { border: "1px solid var(--os-paper-ink)", padding: "1.5mm 2mm", verticalAlign: "top" } as const;
    const head = { ...cell, background: "var(--os-paper-shade)", textAlign: "left", fontSize: "10pt" } as const;
    const team = (x: PrintSide | null, office: boolean) =>
      x ? (
        <td style={{ ...cell, ...(x.lost ? { background: "var(--os-paper-shade)", color: "var(--os-paper-line)" } : null) }}>
          <strong>{x.number}</strong>
          {x.players.map((name) => (
            <div key={name}>{name}</div>
          ))}
          {x.affiliation && <div style={{ fontSize: "9pt" }}>{x.affiliation}</div>}
        </td>
      ) : (
        <td style={{ ...cell, background: "var(--os-paper-shade)", fontWeight: 900 }}>{office ? p.office : p.exempt}</td>
      );
    body = (
      <>
        {sections.map((x) => (
          <section key={x.round.id} data-print-round={x.round.id} style={{ marginBottom: "6mm" }}>
            <h2 style={{ fontSize: "14pt", margin: "0 0 2mm" }}>
              {several ? `${p.brackets[x.bracket] ?? ""} · ` : ""}
              {fmt(p.results, { label: roundName(state, x.round) })}
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11pt" }}>
              <thead>
                <tr>
                  <th style={{ ...head, width: "18mm" }}>{noun}</th>
                  <th style={head}>{p.colTeam}</th>
                  <th style={head}>{p.colTeam}</th>
                  <th style={{ ...head, width: "22mm", textAlign: "center" }}>{p.colScore}</th>
                </tr>
              </thead>
              <tbody>
                {x.rows.map((r) => (
                  <tr key={r.id} style={{ breakInside: "avoid" }}>
                    <td style={{ ...cell, fontWeight: 900, fontSize: "14pt" }}>{r.venue}</td>
                    {team(r.a, x.office)}
                    {team(r.b, x.office)}
                    <td style={{ ...cell, textAlign: "center", fontWeight: 900, fontSize: "13pt" }}>{r.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <p style={{ fontSize: "9pt" }}>{p.notPlayed}</p>
      </>
    );
  } else if (doc === "sheets") {
    const list: Match[] = Object.values(state.matches)
      .filter((x) => ["waiting_venue", "ready", "playing", "pending", "score_submitted", "disputed"].includes(x.status) && x.sideA.length && x.sideB.length)
      .sort((a, b) => (state.venues[a.venueId ?? ""]?.position ?? 999) - (state.venues[b.venueId ?? ""]?.position ?? 999));
    body = list.map((x) => (
      <section key={x.id} style={{ border: "2px solid var(--os-paper-ink)", padding: "5mm", marginBottom: "6mm", breakInside: "avoid", height: "125mm" }}>
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
              <tr key={r.id} style={{ borderBottom: "1px solid var(--os-paper-line)" }}>
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
              <tr key={team.id} style={{ borderBottom: "1px solid var(--os-paper-line)" }}>
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
    <div id="print-root" style={{ fontFamily: "Arial, sans-serif", color: "var(--os-paper-ink)", background: "var(--os-paper)", padding: "10mm" }}>
      {header}
      {body}
    </div>
  );
}
