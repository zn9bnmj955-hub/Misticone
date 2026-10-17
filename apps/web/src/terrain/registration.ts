import type { SportConfig } from "@orgasport/sports";
import { fmt, getMessages } from "@/i18n";
import { formatDay, formatEuros, formatTime } from "@/lib/format";
import type { TournamentMeta } from "@/lib/tournament/load";
import type { RegistrationInput, RegistrationIssue, RegistrationWindow, TeamShape } from "@/lib/tournament/registration-rules";
import { legalLinks } from "./legal";
import { html, raw, type SafeHtml } from "./html";
import { TERRAIN_CSS } from "./styles.generated";
import { notifyBlock, notifyScriptTag, TERRAIN_HEAD_LINKS } from "./notify-script";

/**
 * Online registration pages, in the "terrain" regime: plain HTML forms that
 * work without JavaScript on old phones. Field names are short and stable
 * (they are also used by the end-to-end tests).
 */

export type FormValues = Record<string, string>;

export const FIELD = {
  first: (i: number) => `p${i}_prenom`,
  last: (i: number) => `p${i}_nom`,
  license: (i: number) => `p${i}_licence`,
  category: (i: number) => `p${i}_categorie`,
  teamName: "equipe_nom",
  club: "club",
  captainName: "cap_nom",
  phone: "cap_tel",
  email: "cap_email",
  rules: "reglement",
  certify: "certif",
  teammates: "coequipiers",
  me: "moi",
  honeypot: "site_web",
  turnstile: "cf-turnstile-response",
} as const;

/** Form fields → registration input. Empty substitute blocks are dropped. */
export function parseRegistrationForm(
  form: URLSearchParams,
  shape: TeamShape,
): { input: RegistrationInput; values: FormValues; certified: boolean; teammatesInformed: boolean; honeypot: string; turnstileToken: string | null } {
  const get = (k: string) => (form.get(k) ?? "").trim();
  const values: FormValues = {};
  for (const [k, v] of form.entries()) if (k !== FIELD.turnstile && k.length < 40) values[k] = v.slice(0, 200);
  const players: RegistrationInput["players"] = [];
  const blocks = shape.players + shape.substitutes;
  for (let i = 0; i < blocks; i++) {
    const p = {
      firstName: get(FIELD.first(i)).slice(0, 120),
      lastName: get(FIELD.last(i)).slice(0, 120),
      license: shape.license === "hidden" ? null : get(FIELD.license(i)).replace(/\s+/g, "") || null,
      category: shape.categories ? get(FIELD.category(i)) || null : null,
    };
    const empty = !p.firstName && !p.lastName && !p.license;
    if (i >= shape.players && empty) continue;
    players.push(p);
  }
  return {
    input: {
      teamName: get(FIELD.teamName).slice(0, 120) || null,
      club: get(FIELD.club).slice(0, 120) || null,
      players,
      captain: { name: get(FIELD.captainName).slice(0, 120), phone: get(FIELD.phone).slice(0, 40) || null, email: get(FIELD.email).slice(0, 200) || null },
      acceptedRules: form.get(FIELD.rules) === "on",
      selfIsFirstPlayer: form.get(FIELD.me) === "on",
    },
    values,
    certified: form.get(FIELD.certify) === "on",
    teammatesInformed: form.get(FIELD.teammates) === "on",
    honeypot: get(FIELD.honeypot),
    turnstileToken: form.get(FIELD.turnstile),
  };
}

/** Engine-side issue paths → form field names. */
export function issueField(issue: RegistrationIssue): string {
  const m = /^players\.(\d+)\.(firstName|lastName|license|category)$/.exec(issue.path);
  if (m) {
    const i = Number(m[1]);
    return { firstName: FIELD.first(i), lastName: FIELD.last(i), license: FIELD.license(i), category: FIELD.category(i) }[m[2] as "firstName"];
  }
  const map: Record<string, string> = {
    teamName: FIELD.teamName,
    club: FIELD.club,
    "captain.name": FIELD.captainName,
    "captain.email": FIELD.email,
    "captain.phone": FIELD.phone,
    captain: FIELD.phone,
    acceptedRules: FIELD.rules,
    certify: FIELD.certify,
    teammates: FIELD.teammates,
    players: "players",
  };
  return map[issue.path] ?? issue.path;
}

export function terrainDocument(opts: { title: string; sportToken: string; top?: SafeHtml; body: SafeHtml; head?: SafeHtml }): string {
  return html`<!doctype html>
<html lang="fr" data-sport="${opts.sportToken}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${opts.title}</title>
<meta name="robots" content="noindex">
<script>${raw('try{var th=localStorage.getItem("os_theme");if(th==="light"||th==="dark")document.documentElement.setAttribute("data-theme",th)}catch(e){}')}</script>
<style>${raw(TERRAIN_CSS)}</style>
${opts.head ?? ""}
</head>
<body>
<div class="wrap">${opts.top ?? ""}<main>${opts.body}</main><footer class="foot no-print">${legalLinks()}</footer></div>
</body>
</html>`.value;
}

function header(meta: TournamentMeta, sport: SportConfig): SafeHtml {
  const code = meta.short_code!;
  const format = sport.teamFormats.find((f) => f.id === meta.team_format)?.label;
  return html`<header class="top">
    <a class="brand" href="/">Orga<b>Sport</b></a><span class="code">${code}</span>
    <h1>${meta.name}</h1>
    <p class="meta">${[sport.name, format, meta.city].filter(Boolean).join(" · ")} · ${formatDay(meta.starts_at)} · ${formatTime(meta.starts_at)}</p>
  </header>`;
}

function summary(meta: TournamentMeta): SafeHtml {
  const m = getMessages();
  const r = m.registration.summary;
  const place = [meta.address, meta.postcode, meta.city].filter(Boolean).join(", ");
  const fee =
    meta.fee_cents > 0
      ? fmt(m.tournament.fee, { amount: formatEuros(meta.fee_cents), per: meta.fee_per === "player" ? m.tournament.perPlayer : m.tournament.perTeam })
      : m.tournament.free;
  return html`<dl class="info reg-sum">
    <dt>${r.when}</dt><dd>${formatDay(meta.starts_at)} · ${formatTime(meta.starts_at)}${meta.checkin_closes_at ? html` · ${fmt(r.checkIn, { time: formatTime(meta.checkin_closes_at) })}` : ""}</dd>
    ${place ? html`<dt>${r.where}</dt><dd>${place}</dd>` : ""}
    <dt>${r.fee}</dt><dd>${fee}. ${meta.fee_cents > 0 ? r.payOnSite : ""}</dd>
    ${meta.prize_text ? html`<dt>${r.prize}</dt><dd>${meta.prize_text}</dd>` : ""}
    ${meta.registration_closes_at ? html`<dd class="muted">${fmt(r.closes, { date: formatDay(meta.registration_closes_at), time: formatTime(meta.registration_closes_at) })}</dd>` : ""}
  </dl>`;
}

type FormOpts = {
  meta: TournamentMeta;
  sport: SportConfig;
  shape: TeamShape;
  window: RegistrationWindow;
  values: FormValues;
  issues: RegistrationIssue[];
  /** A message shown above the form (busy, rate limited, robot check). */
  notice: string | null;
  signedIn: boolean;
  turnstileSiteKey: string | null;
  rulesPdfUrl: string | null;
};

function field(opts: {
  name: string;
  label: string;
  value: string;
  error: string | null;
  required?: boolean;
  type?: string;
  autocomplete?: string;
  inputmode?: string;
  pattern?: string | null;
  help?: string | null;
}): SafeHtml {
  const id = `f_${opts.name}`;
  return html`<div class="fld${opts.error ? " bad" : ""}">
    <label for="${id}">${opts.label}</label>
    <input id="${id}" name="${opts.name}" value="${opts.value}" type="${opts.type ?? "text"}"${opts.required ? raw(" required") : ""}${
      opts.autocomplete ? html` autocomplete="${opts.autocomplete}"` : ""
    }${opts.inputmode ? html` inputmode="${opts.inputmode}"` : ""}${opts.pattern ? html` pattern="${opts.pattern}"` : ""}${
      opts.error ? html` aria-invalid="true" aria-describedby="${id}_err"` : ""
    }>
    ${opts.help ? html`<small>${opts.help}</small>` : ""}
    ${opts.error ? html`<small class="ferr" id="${id}_err">${opts.error}</small>` : ""}
  </div>`;
}

/** The captain enters other people's data: they must have been told (GDPR art. 14). */
export function hasTeammates(shape: TeamShape): boolean {
  return !shape.individual && shape.players + shape.substitutes > 1;
}

function errorText(issue: RegistrationIssue | undefined, hint: string | null): string | null {
  if (!issue) return null;
  const e = getMessages().registration.errors;
  if (issue.code === "license") return hint ? fmt(e.license, { hint }) : e.licenseNoHint;
  if (issue.path === "certify") return e.certify;
  if (issue.path === "teammates") return e.teammates;
  return e[issue.code];
}

export function renderRegistrationPage(o: FormOpts): string {
  const m = getMessages();
  const r = m.registration;
  const code = o.meta.short_code!;
  const byField = new Map<string, RegistrationIssue>();
  for (const issue of o.issues) {
    const f = issueField(issue);
    if (!byField.has(f)) byField.set(f, issue);
  }
  const err = (name: string) => errorText(byField.get(name), o.shape.licenseHint);
  const v = (name: string) => o.values[name] ?? "";
  const canRegister = o.window === "open" || o.window === "waitlist";
  const categoryName = m.categoryLabels[o.meta.category as keyof typeof m.categoryLabels] ?? o.meta.category;
  const licensePattern = o.sport.license.numberPattern?.replace(/^\^/, "").replace(/\$$/, "") ?? null;

  const playerBlock = (i: number) => {
    const optional = i >= o.shape.players;
    const title = o.shape.individual ? r.form.individualTitle : optional ? fmt(r.form.substitute, { n: i - o.shape.players + 1 }) : fmt(r.form.player, { n: i + 1 });
    return html`<fieldset class="pl">
      <legend>${title}</legend>
      ${field({ name: FIELD.first(i), label: r.form.firstName, value: v(FIELD.first(i)), error: err(FIELD.first(i)), required: !optional, autocomplete: i === 0 ? "given-name" : "off" })}
      ${field({ name: FIELD.last(i), label: r.form.lastName, value: v(FIELD.last(i)), error: err(FIELD.last(i)), required: !optional, autocomplete: i === 0 ? "family-name" : "off" })}
      ${
        o.shape.license === "hidden"
          ? ""
          : field({
              name: FIELD.license(i),
              label: o.shape.license === "required" && !optional ? r.form.license : r.form.licenseOptional,
              value: v(FIELD.license(i)),
              error: err(FIELD.license(i)),
              required: o.shape.license === "required" && !optional,
              inputmode: "numeric",
              pattern: licensePattern,
              autocomplete: "off",
              help: [o.shape.licenseHint, r.form.licenseHelp].filter(Boolean).join(" · "),
            })
      }
      ${
        o.shape.categories
          ? html`<div class="fld${err(FIELD.category(i)) ? " bad" : ""}"><label for="f_${FIELD.category(i)}">${r.form.category}</label>
            <select id="f_${FIELD.category(i)}" name="${FIELD.category(i)}"><option value="">—</option>${o.shape.categories.map(
              (c) => html`<option value="${c}"${v(FIELD.category(i)) === c ? raw(" selected") : ""}>${m.categoryLabels[c as keyof typeof m.categoryLabels] ?? c}</option>`,
            )}</select></div>`
          : ""
      }
    </fieldset>`;
  };

  const blocks = Array.from({ length: o.shape.players + o.shape.substitutes }, (_, i) => playerBlock(i));
  const playersError = byField.get("players") ? html`<p class="msg err" role="alert">${r.errors.count}</p>` : "";
  const turnstile = o.turnstileSiteKey
    ? html`<div class="cf-turnstile" data-sitekey="${o.turnstileSiteKey}" data-language="fr"></div>`
    : "";

  const form = html`<form class="reg" method="post" action="/c/${code}/inscription" novalidate>
    ${o.issues.length ? html`<p class="msg err" role="alert">${r.errors.title}</p>` : ""}
    ${o.signedIn && !o.issues.length ? html`<p class="muted">${r.form.prefilled}</p>` : ""}
    <h2>${o.shape.individual ? r.form.individualTitle : r.form.playersTitle}</h2>
    ${o.shape.individual ? html`<p class="muted">${r.form.individualHelp}</p>` : ""}
    ${playersError}
    ${blocks}
    ${o.signedIn ? html`<label class="chk"><input type="checkbox" name="${FIELD.me}"${v(FIELD.me) === "on" ? raw(" checked") : ""}> ${r.form.me}</label>` : ""}
    ${
      !o.shape.categories && o.meta.category !== "all"
        ? html`<label class="chk${err(FIELD.certify) ? " bad" : ""}"><input type="checkbox" name="${FIELD.certify}"${v(FIELD.certify) === "on" ? raw(" checked") : ""}> ${fmt(r.form.certify, { category: categoryName })}</label>${
            err(FIELD.certify) ? html`<small class="ferr">${err(FIELD.certify)}</small>` : ""
          }`
        : ""
    }
    ${
      o.shape.individual
        ? ""
        : html`<h2>${r.form.teamTitle}</h2>
      ${field({ name: FIELD.teamName, label: r.form.teamName, value: v(FIELD.teamName), error: err(FIELD.teamName), autocomplete: "off" })}
      ${field({ name: FIELD.club, label: r.form.club, value: v(FIELD.club), error: err(FIELD.club), autocomplete: "organization" })}`
    }
    <h2>${r.form.captainTitle}</h2>
    <p class="muted">${r.form.captainHelp}</p>
    ${field({ name: FIELD.captainName, label: r.form.captainName, value: v(FIELD.captainName), error: err(FIELD.captainName), required: true, autocomplete: "name" })}
    ${field({ name: FIELD.phone, label: r.form.phone, value: v(FIELD.phone), error: err(FIELD.phone), type: "tel", autocomplete: "tel", inputmode: "tel", help: r.form.contactHint })}
    ${field({ name: FIELD.email, label: r.form.email, value: v(FIELD.email), error: err(FIELD.email), type: "email", autocomplete: "email" })}
    ${
      o.meta.rules_text
        ? html`<details class="rules"><summary>${r.form.readRules}</summary><p>${o.meta.rules_text}</p></details>`
        : ""
    }
    ${o.rulesPdfUrl ? html`<p><a href="${o.rulesPdfUrl}" target="_blank" rel="noopener">${r.form.rulesPdf}</a></p>` : ""}
    <label class="chk${err(FIELD.rules) ? " bad" : ""}"><input type="checkbox" name="${FIELD.rules}" required${v(FIELD.rules) === "on" ? raw(" checked") : ""}> ${r.form.rules}</label>
    ${err(FIELD.rules) ? html`<small class="ferr">${err(FIELD.rules)}</small>` : ""}
    ${
      hasTeammates(o.shape)
        ? html`<label class="chk${err(FIELD.teammates) ? " bad" : ""}"><input type="checkbox" name="${FIELD.teammates}" required${v(FIELD.teammates) === "on" ? raw(" checked") : ""}> ${r.form.teammates}</label>${
            err(FIELD.teammates) ? html`<small class="ferr">${err(FIELD.teammates)}</small>` : ""
          }`
        : ""
    }
    <p class="muted">${fmt(r.form.privacy, {
      organizer: o.meta.club?.name ?? r.form.privacyOrganizer,
      names: o.meta.name_display === "full" ? r.form.namesFull : r.form.namesInitials,
    })} <a href="/legal/confidentialite">${r.form.privacyLink}</a></p>
    <div class="hp" aria-hidden="true"><label for="f_hp">${r.form.honeypot}</label><input id="f_hp" name="${FIELD.honeypot}" tabindex="-1" autocomplete="off"></div>
    ${turnstile}
    <p><button class="btn wide" type="submit">${o.shape.individual ? r.form.submitIndividual : r.form.submit}</button></p>
  </form>`;

  const body = html`<p><a href="/c/${code}">← ${r.back}</a></p>
    <h2 class="reg-title">${r.title}</h2>
    ${summary(o.meta)}
    ${o.notice ? html`<p class="msg err" role="alert">${o.notice}</p>` : ""}
    ${o.window === "waitlist" ? html`<p class="msg" role="status">${r.window.waitlist}</p>` : ""}
    ${canRegister ? form : html`<p class="msg">${o.meta.status === "finished" || o.meta.status === "archived" ? r.window[o.meta.status] : r.window[o.window as "closed" | "full" | "onsite_only"]}</p><p><a class="btn" href="/c/${code}">${r.back}</a></p>`}`;

  return terrainDocument({
    title: fmt(r.pageTitle, { name: o.meta.name }),
    sportToken: o.sport.accentToken,
    top: header(o.meta, o.sport),
    body,
    head: o.turnstileSiteKey && canRegister ? raw('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>') : undefined,
  });
}

export function renderConfirmationPage(o: {
  meta: TournamentMeta;
  sport: SportConfig;
  team: { number: number; status: string; label: string } | null;
  waitlistPosition: number | null;
}): string {
  const m = getMessages();
  const r = m.registration.ok;
  const code = o.meta.short_code!;
  const body = o.team
    ? html`
      <div class="card">
        <div class="head">${r.title}<small>${o.team.label}</small></div>
        <div class="big"><div><div class="k">${m.common.teams}</div><div class="v">${o.team.number}</div></div></div>
        <div class="vs${o.team.status === "waitlist" ? " wait" : ""}">${fmt(o.team.status === "waitlist" ? r.waitlist : r.registered, { number: o.team.number })}</div>
        ${o.waitlistPosition ? html`<div class="note">${fmt(r.waitlistPosition, { position: o.waitlistPosition })}</div>` : ""}
      </div>
      <h2>${r.recapTitle}</h2>
      ${summary(o.meta)}
      ${o.meta.checkin_closes_at ? html`<p><b>${fmt(r.bring, { time: formatTime(o.meta.checkin_closes_at) })}</b></p>` : ""}
      <p class="actions">
        <a class="btn" href="/c/${code}/calendrier.ics">${r.calendar}</a>
        <a class="btn secondary" href="/c/${code}?equipe=${o.team.number}">${r.see}</a>
      </p>
      <section id="notify" class="card notify">
        <div class="head">${r.notifyTitle}</div>
        <p class="note">${r.notifyText}</p>
        <p class="note muted">${r.notifySoon}</p>
        ${notifyBlock(code, o.team.number)}
      </section>
      ${notifyScriptTag()}`
    : html`<p class="msg err">${r.unknown}</p><p><a class="btn" href="/c/${code}">${m.registration.back}</a></p>`;
  return terrainDocument({ title: fmt(m.registration.pageTitle, { name: o.meta.name }), sportToken: o.sport.accentToken, top: header(o.meta, o.sport), body, head: raw(TERRAIN_HEAD_LINKS) });
}
