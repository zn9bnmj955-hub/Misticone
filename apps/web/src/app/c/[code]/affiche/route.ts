import QRCode from "qrcode";
import { getSport } from "@orgasport/sports";
import { isShortCode, normalizeShortCode } from "@orgasport/engine";
import { fmt, getMessages } from "@/i18n";
import { env } from "@/lib/env";
import { formatDay, formatEuros, formatTime } from "@/lib/format";
import { createPublicClient } from "@/lib/supabase/public";
import { lightPalette } from "@/lib/email/layout";
import { html, raw } from "@/terrain/html";
import { TERRAIN_CSS } from "@/terrain/styles.generated";

/** Light token values only (a poster is printed on white paper), plus the sport accent block. */
function posterTokens(accentToken: string | undefined): string {
  const light = [...TERRAIN_CSS.matchAll(/:root\{([^}]*)\}/g)].map((x) => x[1]).join(";");
  const sport = accentToken ? (new RegExp(`\\[data-sport="${accentToken}"\\]\\{([^}]*)\\}`).exec(TERRAIN_CSS)?.[1] ?? "") : "";
  return `:root{${light};${sport}}`;
}

type Ctx = { params: Promise<{ code: string }> };

/** Printable A4 poster with the QR code, generated from the tournament data. */
export async function GET(_request: Request, { params }: Ctx) {
  const { code: rawCode } = await params;
  const code = normalizeShortCode(rawCode);
  if (!isShortCode(code)) return new Response("Not found", { status: 404 });
  const { data: t } = await createPublicClient()
    .from("tournaments")
    .select("name, sport_slug, starts_at, address, postcode, city, team_format, fee_cents, fee_per, prize_text, eligibility, clubs (name)")
    .eq("short_code", code)
    .neq("status", "draft")
    .maybeSingle();
  if (!t) return new Response("Not found", { status: 404 });
  const m = getMessages();
  const sport = getSport(t.sport_slug);
  const palette = lightPalette();
  const p = m.a11y.poster;
  const url = `${env.siteUrl.replace(/^https?:\/\//, "")}/c/${code}`;
  const qr = await QRCode.toString(`${env.siteUrl}/c/${code}`, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: palette.ink, light: palette.surface } });
  const format = sport?.teamFormats.find((f) => f.id === t.team_format)?.label;
  const fee =
    t.fee_cents > 0 ? fmt(m.tournament.fee, { amount: formatEuros(t.fee_cents), per: t.fee_per === "player" ? m.tournament.perPlayer : m.tournament.perTeam }) : m.tournament.free;
  const club = (t.clubs as { name: string } | null)?.name;
  const page = html`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${fmt(p.title, { name: t.name })}</title>
<style>
${raw(posterTokens(sport?.accentToken))}
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:var(--os-ink);background:var(--os-bg)}
.sheet{width:210mm;min-height:297mm;margin:0 auto;background:var(--os-surface);padding:16mm 16mm 12mm;display:flex;flex-direction:column}
.band{background:var(--os-inverse);color:var(--os-on-inverse);padding:8mm 10mm;border-radius:6mm}
.sport{font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:var(--os-accent);font-size:14pt}
h1{font-size:40pt;line-height:1;margin:4mm 0 0;font-weight:900;font-style:italic;text-transform:uppercase;overflow-wrap:anywhere}
.facts{font-size:18pt;font-weight:800;margin:8mm 0 0;line-height:1.35}
.facts span{display:block}
.qr{margin:auto 0 0;display:flex;align-items:center}
.qr svg{width:80mm;height:80mm;flex:none}
.qr div{margin-left:10mm}
.big{font-size:22pt;font-weight:900}
.code{font-size:44pt;font-weight:900;letter-spacing:.15em;color:var(--os-ink)}
.small{font-size:12pt;color:var(--os-ink-soft);margin-top:3mm;overflow-wrap:anywhere}
.foot{margin-top:8mm;font-size:11pt;color:var(--os-ink-soft);display:flex;justify-content:space-between}
@media screen{.sheet{box-shadow:var(--shadow-pop);margin:8mm auto}}
@media screen and (max-width:800px){.sheet{width:auto;min-height:0;margin:0;padding:6mm}h1{font-size:28pt}.qr{flex-wrap:wrap;margin-top:8mm}.qr svg{width:60mm;height:60mm}.qr div{margin:4mm 0 0}.code{font-size:34pt}}
@media print{body{background:var(--os-surface)}}
</style></head><body><div class="sheet">
<div class="band"><div class="sport">${sport?.name ?? ""}${format ? ` · ${format}` : ""}</div><h1>${t.name}</h1></div>
<div class="facts">
<span>${formatDay(t.starts_at)} · ${formatTime(t.starts_at)}</span>
<span>${[t.address, t.city].filter(Boolean).join(", ")}</span>
<span>${fee}${t.prize_text ? ` · ${t.prize_text}` : ""}</span>
<span>${t.eligibility === "licensed" ? m.tournament.licensed : m.tournament.open}</span>
</div>
<div class="qr">${raw(qr)}<div>
<div class="big">${p.find}</div>
<div class="small">${fmt(p.scan, { site: url.split("/c/")[0] })}</div>
<div class="code">${code}</div>
<div class="small">${url}</div>
</div></div>
<div class="foot"><span>${club ? fmt(p.by, { club }) : ""}</span><span>${p.brand}</span></div>
</div></body></html>`;
  return new Response(page.value, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
