import { isOfficeBye, loserTeams, roundLabel as engineRoundLabel, teamMatches, type Bracket, type EngineState, type Match, type Round } from "@orgasport/engine";
import { venueLabel, type SportConfig } from "@orgasport/sports";
import { fmt, getMessages, type Messages } from "@/i18n";
import { formatDay } from "@/lib/format";
import type { TournamentMeta } from "@/lib/tournament/load";
import { html, raw, type SafeHtml } from "./html";
import { legalLinks } from "./legal";
import { TERRAIN_CSS } from "./styles.generated";
import { buildTeamViews, type TeamView } from "./view-model";

/**
 * « Résultats par équipes » (/c/CODE/equipes): every team in alphabetical
 * order with its players, club or « N.H. », status and game-by-game path, one
 * anchor per team (#e12) for Ctrl+F and links. Before the draw it is the list
 * of registered teams. Plain HTML, no script; only public data (names as
 * chosen by the organizer, clubs) — never licences or contacts.
 */

const THEME_COLOR = /--os-inverse:([^;}]+)/.exec(TERRAIN_CSS)?.[1] ?? "";
const BRACKETS: Bracket[] = ["main", "consolation", "consolation_c"];
const POOL_LIKE = new Set<Round["phase"]>(["pool", "swiss", "league", "melee"]);

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

export interface TeamsPageRow {
  team: TeamView;
  /** First letter (A-Z, or « # ») of the sort key: the alphabetical index points at the first team of each letter. */
  letter: string;
  status: string[];
  path: SafeHtml[];
}

/** Round name without the « Concours B · » prefix, for « éliminée en 1/4 de finale ». */
function plainRoundLabel(state: EngineState, round: Round, m: Messages): string {
  const r = m.terrain.rounds;
  const key = engineRoundLabel(state, round);
  return "n" in key ? (key.key === "partie" && key.n === 1 ? r.partie1 : fmt(r[key.key], { n: key.n })) : r[key.key];
}

const roundOrder = (r: Round) => (POOL_LIKE.has(r.phase) ? 0 : 1) * 10000 + r.number;

function gameLine(state: EngineState, teams: Map<string, TeamView>, teamId: string, x: Match, venueInitial: string, m: Messages): SafeHtml {
  const p = m.teamsPage;
  const round = state.rounds[x.roundId]!;
  // « B · 1re partie »: the bracket letter is enough next to the per-bracket status.
  const plain = plainRoundLabel(state, round, m);
  const label = round.bracket === "main" ? plain : fmt(p.bracketRound, { bracket: p.letter[round.bracket], label: plain });
  if (x.status === "bye") {
    if (isOfficeBye(state, x)) return html`${label} : ${p.office}`;
    const bye = state.tournament.config.byeScore;
    const mineA = x.sideA.includes(teamId);
    const s = x.scoreA !== null && x.scoreB !== null ? (mineA ? `${x.scoreA}-${x.scoreB}` : `${x.scoreB}-${x.scoreA}`) : `${bye.winner}-${bye.loser}`;
    return html`${label} : ${p.exempt} ${s}`;
  }
  const mineA = x.sideA.includes(teamId);
  const opp = mineA ? x.sideB : x.sideA;
  const versus = opp.length
    ? // Plain numbers (no link): the page stays under 100 KB for 256 teams, and Ctrl+F finds « 146 ».
      html` ${fmt(p.versus, { n: opp.map((id) => teams.get(id)?.number ?? "?").join("+") })}`
    : "";
  const played = (x.status === "done" || x.status === "forfeit") && x.winner !== null;
  if (!played) {
    const v = x.venueId ? state.venues[x.venueId] : undefined;
    const where = v ? ` ${fmt(m.terrain.sheet.venue, { initial: venueInitial, label: v.label })}` : "";
    return html`${label} : ${p.toPlay}${where}${versus}`;
  }
  const result = x.winner === "draw" ? p.draw : loserTeams(x).includes(teamId) ? p.lost : p.won;
  const us = mineA ? x.scoreA : x.scoreB;
  const them = mineA ? x.scoreB : x.scoreA;
  const score = us !== null && them !== null ? ` ${us}-${them}` : "";
  const forfeit = x.status === "forfeit" ? ` (${m.terrain.status.forfeit})` : "";
  const text = html`${result}${score}${forfeit}`;
  return html`${label} : ${result === p.won ? html`<b>${text}</b>` : text}${versus}`;
}

/** Where the team stands in one bracket: in play, out at round X, winner. */
function bracketState(state: EngineState, teamId: string, ms: Match[], m: Messages): string {
  const p = m.teamsPage;
  const elim = ms.filter((x) => !POOL_LIKE.has(state.rounds[x.roundId]!.phase));
  const last = elim[elim.length - 1];
  if (last) {
    const round = state.rounds[last.roundId]!;
    if (loserTeams(last).includes(teamId)) return fmt(p.out, { round: plainRoundLabel(state, round, m).toLocaleLowerCase("fr-FR") });
    const won = (last.status === "done" || last.status === "forfeit") && last.winner !== null && last.winner !== "draw";
    if (won && engineRoundLabel(state, round).key === "final") return p.winner;
    return p.inPlay;
  }
  // Pools only so far: out once the final phase is drawn without the team.
  const pools = ms[0] ? state.rounds[ms[0].roundId]! : null;
  if (pools?.phase === "pool" && Object.values(state.rounds).some((r) => r.bracket === pools.bracket && r.phase === "final" && r.status !== "pending")) return p.outPools;
  if (state.tournament.status === "finished" || state.tournament.status === "archived") return p.done;
  return p.inPlay;
}

export function teamsPageRows(state: EngineState, teams: Map<string, TeamView>, sport: SportConfig, m: Messages = getMessages()): TeamsPageRow[] {
  const p = m.teamsPage;
  const initial = venueLabel(sport).charAt(0);
  const rows = [...teams.values()].map((team) => {
    const t = state.teams[team.id]!;
    const key = fold(team.players[0] ?? team.label);
    const all = teamMatches(state, team.id).sort((a, b) => {
      const ra = state.rounds[a.roundId]!;
      const rb = state.rounds[b.roundId]!;
      return BRACKETS.indexOf(ra.bracket) - BRACKETS.indexOf(rb.bracket) || roundOrder(ra) - roundOrder(rb);
    });
    const status: string[] = [];
    if (all.length === 0 || t.status === "forfeit" || t.status === "withdrawn") status.push(p.status[t.status]);
    // Only the furthest bracket: a team in the B (or C) has necessarily left the A (or B), as its path shows.
    const bracket = [...BRACKETS].reverse().find((b) => all.some((x) => state.rounds[x.roundId]!.bracket === b));
    if (bracket) {
      const ms = all.filter((x) => state.rounds[x.roundId]!.bracket === bracket);
      status.push(fmt(p.bracket, { bracket: m.terrain.sheet.brackets[bracket], state: bracketState(state, team.id, ms, m) }));
    }
    return {
      key,
      row: {
        team,
        letter: /^[A-Z]/.test(key) ? key[0]! : "#",
        status,
        path: all.map((x) => gameLine(state, teams, team.id, x, initial, m)),
      },
    };
  });
  return rows.sort((a, b) => a.key.localeCompare(b.key, "fr") || a.row.team.number - b.row.team.number).map((r) => r.row);
}

export interface TeamsPageInput {
  meta: TournamentMeta;
  sport: SportConfig;
  state: EngineState;
}

export function renderTeamsPage(t: TeamsPageInput): string {
  const m = getMessages();
  const p = m.teamsPage;
  const code = t.meta.short_code!;
  const teams = buildTeamViews(t.state, t.meta.name_display, m);
  const rows = teamsPageRows(t.state, teams, t.sport, m);
  const drawn = Object.values(t.state.rounds).some((r) => r.status !== "pending");
  const title = drawn ? p.title : p.registered;
  const letters = [...new Set(rows.map((r) => r.letter))];
  const firstOfLetter = new Set(letters.map((l) => rows.find((r) => r.letter === l)!.team.id));
  const format = t.sport.teamFormats.find((f) => f.id === t.meta.team_format)?.label;
  const body = rows.length
    ? html`<table class="teams"><thead><tr><th>${p.number}</th><th>${p.team}</th>${drawn ? html`<th>${p.path}</th>` : ""}</tr></thead><tbody>${rows.map(
        (r) =>
          html`<tr id="e${r.team.number}"><td class="n"><b${firstOfLetter.has(r.team.id) ? raw(` id="l-${r.letter === "#" ? "0" : r.letter}"`) : ""}>${r.team.number}</b></td><td><b>${r.team.players.map(
            (x, i) => html`${i ? raw("<br>") : ""}${x}`,
          )}</b>${r.team.affiliation ? html`<br>${r.team.affiliation}` : ""}${
            r.status.length ? html`<br><span class="st">${r.status.map((s, i) => html`${i ? raw("<br>") : ""}${s}`)}</span>` : ""
          }</td>${
            drawn ? html`<td>${r.path.map((x, i) => html`${i ? raw("<br>") : ""}${x}`)}</td>` : ""
          }</tr>`,
      )}</tbody></table>`
    : html`<p class="msg">${p.empty}</p>`;
  return html`<!doctype html>
<html lang="fr" data-sport="${t.sport.accentToken}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ${t.meta.name} · ${code}</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="${THEME_COLOR}">
<script>${raw('try{var th=localStorage.getItem("os_theme");if(th==="light"||th==="dark")document.documentElement.setAttribute("data-theme",th)}catch(e){}')}</script>
<style>${raw(TERRAIN_CSS)}</style>
</head>
<body data-code="${code}">
<div class="wrap">
  <header class="top">
    <a class="brand" href="/">Orga<b>Sport</b></a><span class="code">${code}</span>
    <h1>${t.meta.name}</h1>
    <p class="meta">${[t.sport.name, format, t.meta.city].filter(Boolean).join(" · ")} · ${formatDay(t.meta.starts_at)}</p>
  </header>
  <p class="no-print"><a class="btn secondary" href="/c/${code}">${p.back}</a></p>
  <h2>${title} <span class="muted">(${rows.length === 1 ? p.countOne : fmt(p.count, { n: rows.length })})</span></h2>
  ${
    letters.length > 1
      ? html`<p class="no-print"><span class="muted">${p.letters} :</span> ${letters.map((l) => html`<a href="#l-${l === "#" ? "0" : l}">${l}</a> `)}<br><span class="muted">${p.hint}</span></p>`
      : html`<p class="no-print muted">${p.hint}</p>`
  }
  ${body}
  <footer class="foot no-print">
    <a href="/c/${code}">${p.back}</a>
    <a href="/">${m.terrain.poweredBy}</a>
    ${legalLinks()}
  </footer>
</div>
</body>
</html>`.value;
}
