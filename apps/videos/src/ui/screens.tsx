import React from "react";
import { C, NUM, TITLE, clamp01, mix, ramp } from "../theme";
import { Button, Caret, Card, Dot, LiveBadge, Logo, Notification, Pill, QR, SCREEN_H, SCREEN_W, typed } from "./kit";

/* Interface mockups, rebuilt from the site (dark theme, tokens, Saira).        */
/* Every screen is 360 × 760 and receives its local time `t` in seconds.       */

export const Screen = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ position: "absolute", inset: 0, padding: "56px 18px 18px", background: C.stage, ...style }}>{children}</div>
);

export function AppBar({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {sub ? <div style={{ fontSize: 13, color: C.inkSoft, fontWeight: 600 }}>{sub}</div> : null}
        <div style={{ ...TITLE, fontSize: 26, lineHeight: 1.05 }}>{title}</div>
      </div>
      {right}
    </div>
  );
}

export function Field({ label, value, focus, hint, tag, accent = C.accent }: { label: string; value: React.ReactNode; focus?: boolean; hint?: string; tag?: string; accent?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: C.inkSoft, fontWeight: 600, marginBottom: 6 }}>
        <span>{label}</span>
        {tag ? <Pill color={C.blueInk} style={{ fontSize: 12, padding: "2px 8px" }}>{tag}</Pill> : null}
      </div>
      <div
        style={{
          height: 50,
          borderRadius: 14,
          background: C.surface,
          border: `2px solid ${focus ? accent : C.line}`,
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          fontSize: 19,
          fontWeight: 700,
          boxShadow: focus ? `0 0 0 4px ${accent}33` : undefined,
          ...NUM,
        }}
      >
        {value}
      </div>
      {hint ? <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}

export function Chip({ label, active, accent = C.accent }: { label: string; active?: boolean; accent?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 42,
        padding: "0 16px",
        borderRadius: 999,
        marginRight: 8,
        marginBottom: 8,
        fontSize: 16,
        fontWeight: 700,
        background: active ? accent : C.surface,
        color: active ? C.stage : C.ink,
        border: `2px solid ${active ? accent : C.line}`,
      }}
    >
      {active ? "✓ " : ""}
      {label}
    </span>
  );
}

export function Toast({ text, k, color = C.success }: { text: string; k: number; color?: string }) {
  if (k <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 18,
        right: 18,
        bottom: 96,
        height: 44,
        borderRadius: 14,
        background: C.surface2,
        border: `1px solid ${color}66`,
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        fontSize: 15,
        fontWeight: 700,
        opacity: k,
        transform: `translateY(${(1 - k) * 20}px)`,
        zIndex: 10,
      }}
    >
      <Dot color={color} />
      {text}
    </div>
  );
}

/** Bottom button of a screen (always at the same place: easy to point at). */
export const BOTTOM_BTN: [number, number] = [180, 712];
export function BottomButton({ label, pressed = 0, color = C.accent, ink }: { label: string; pressed?: number; color?: string; ink?: string }) {
  return (
    <div style={{ position: "absolute", left: 18, right: 18, bottom: 22 }}>
      <Button label={label} pressed={pressed} color={color} ink={ink} />
    </div>
  );
}

/** Press amount of a tap at time `at` (for buttons). */
export const press = (t: number, at: number) => clamp01(1 - Math.abs(t - at) / 0.18);

/** Several screens in a row, each sliding in from the right. */
export function Slides({ t, items }: { t: number; items: Array<[number, (lt: number) => React.ReactNode]> }) {
  return (
    <>
      {items.map(([start, render], i) => {
        const end = i + 1 < items.length ? items[i + 1][0] : Infinity;
        if (t < start - 0.01 || t > end + 0.5) return null;
        const kin = i === 0 ? 1 : ramp(t, start, start + 0.45, "inOut");
        const kout = Number.isFinite(end) ? ramp(t, end, end + 0.45, "inOut") : 0;
        const x = (1 - kin) * SCREEN_W - kout * SCREEN_W * 0.3;
        return (
          <div key={i} style={{ position: "absolute", inset: 0, transform: `translateX(${x}px)`, opacity: 1 - kout * 0.6, zIndex: i }}>
            {render(t - start)}
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Public tournament page (/c/7KQ2) — the player's view                     */
/* ------------------------------------------------------------------------ */

export function TerrainPage({ t, highlight = 0 }: { t: number; highlight?: number }) {
  const card = ramp(t, 0.25, 0.8);
  return (
    <Screen style={{ padding: "54px 16px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <Logo size={20} accent={C.accent} />
        <span style={{ flex: 1 }} />
        <LiveBadge />
      </div>
      <div style={{ ...TITLE, fontSize: 28, lineHeight: 1.05 }}>Grand Prix d'automne</div>
      <div style={{ fontSize: 15, color: C.inkSoft, marginBottom: 12, ...NUM }}>Pétanque · doublettes · tour 2</div>
      <div
        style={{
          borderRadius: 22,
          padding: "16px 18px",
          background: `linear-gradient(150deg, ${C.accent}, #00c2ff)`,
          color: C.stage,
          transform: `translateY(${(1 - card) * 40}px) scale(${mix(0.92, 1, card) + highlight * 0.03})`,
          opacity: card,
          boxShadow: `0 16px 50px ${C.accent}${highlight > 0 ? "aa" : "55"}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ ...TITLE, fontSize: 30 }}>À vous !</span>
          <span style={{ fontSize: 14, fontWeight: 800, background: "rgba(4,6,12,0.12)", padding: "3px 10px", borderRadius: 99 }}>Équipe 12</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", marginTop: 4 }}>
          <span style={{ ...TITLE, fontSize: 64, lineHeight: 1, ...NUM }}>Terrain 12</span>
        </div>
        <div style={{ ...TITLE, fontSize: 34, lineHeight: 1.1, ...NUM }}>15 h 40</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>contre Équipe 31 · Garcia – Petit</div>
      </div>
      <div style={{ fontSize: 14, color: C.inkSoft, fontWeight: 700, margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Tour 2 · tous les matchs
      </div>
      {[
        ["1", "Éq. 3 – Éq. 50", "15 h 40"],
        ["2", "Éq. 38 – Éq. 14", "15 h 40"],
        ["3", "Éq. 22 – Éq. 57", "15 h 40"],
        ["4", "Éq. 9 – Éq. 41", "15 h 55"],
        ["5", "Éq. 27 – Éq. 8", "15 h 55"],
      ].map(([n, m, h], i) => (
        <div
          key={n}
          style={{
            display: "flex",
            alignItems: "center",
            height: 46,
            borderBottom: `1px solid ${C.line}`,
            fontSize: 16,
            opacity: ramp(t, 0.5 + i * 0.08, 0.9 + i * 0.08),
            ...NUM,
          }}
        >
          <span style={{ ...TITLE, width: 44, color: C.accentInk, fontSize: 20 }}>T{n}</span>
          <span style={{ flex: 1, fontWeight: 600 }}>{m}</span>
          <span style={{ color: C.inkSoft }}>{h}</span>
        </div>
      ))}
    </Screen>
  );
}

/** Camera viewfinder scanning the QR code of the poster. */
export function ScanScreen({ t }: { t: number }) {
  const found = ramp(t, 2.4, 2.6);
  const line = (t * 0.9) % 1;
  const bracket = found > 0 ? C.success : "#fff";
  return (
    <Screen style={{ background: "#0a0d1c", padding: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at 50% 45%, #2a3050 0%, #0a0d1c 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 170,
          width: 240,
          height: 330,
          background: "#f4f6fb",
          borderRadius: 6,
          transform: `rotate(-4deg) scale(${1 + t * 0.03})`,
          boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
          padding: 16,
          filter: `blur(${found > 0 ? 0 : 0.6}px)`,
        }}
      >
        <div style={{ ...TITLE, fontSize: 24, color: C.cobalt, lineHeight: 1 }}>GRAND PRIX D'AUTOMNE</div>
        <div style={{ fontSize: 13, color: C.cobalt, fontWeight: 700, marginBottom: 10 }}>Pétanque · doublettes</div>
        <QR size={150} style={{ display: "block", margin: "0 auto" }} />
        <div style={{ ...TITLE, fontSize: 18, color: C.cobalt, textAlign: "center", marginTop: 10 }}>Votre match : scannez !</div>
      </div>
      {/* Brackets */}
      {[0, 1, 2, 3].map((i) => {
        const x = i % 2 ? 268 : 62;
        const y = i < 2 ? 220 : 470;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 30,
              height: 30,
              borderColor: bracket,
              borderStyle: "solid",
              borderWidth: `${i < 2 ? 5 : 0}px ${i % 2 ? 5 : 0}px ${i >= 2 ? 5 : 0}px ${i % 2 ? 0 : 5}px`,
              borderRadius: 6,
              transform: `scale(${1 - found * 0.08})`,
            }}
          />
        );
      })}
      {found < 1 ? (
        <div
          style={{
            position: "absolute",
            left: 70,
            right: 70,
            top: 225 + line * 270,
            height: 3,
            background: C.accent,
            boxShadow: `0 0 16px 4px ${C.accent}`,
          }}
        />
      ) : null}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 120, textAlign: "center", fontSize: 17, fontWeight: 700 }}>
        {found > 0 ? "orgasport.fr/c/7KQ2" : "Visez le QR code"}
      </div>
      <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: found * (1 - ramp(t, 2.6, 3.0)) * 0.7 }} />
    </Screen>
  );
}

/* ------------------------------------------------------------------------ */
/* Table de marque (scorers' table)                                          */
/* ------------------------------------------------------------------------ */

export type Entry = { at: number; terrain: number; a: number; b: number; sa: number; sb: number; sentAt?: number };

/** Connection witness, always visible on the scorers' table. */
export function Witness({ state, pending = 0 }: { state: "live" | "offline" | "synced"; pending?: number }) {
  const map = {
    live: { c: C.success, label: "En direct" },
    offline: { c: C.live, label: pending > 0 ? `Hors ligne · ${pending} saisie${pending > 1 ? "s" : ""} en attente` : "Hors ligne" },
    synced: { c: C.success, label: "En direct · tout est envoyé" },
  }[state];
  return (
    <Pill color={map.c} style={{ fontSize: 15, padding: "6px 12px", border: `1.5px solid ${map.c}66` }}>
      <Dot color={map.c} pulse={state === "offline"} size={9} />
      {map.label}
    </Pill>
  );
}

const TABS = ["Pointage", "Tirage", "Terrains", "Scores", "Historique"];
export function Tabs({ active, small }: { active: string; small?: boolean }) {
  return (
    <div style={{ display: "flex", borderBottom: `1.5px solid ${C.line}`, marginBottom: 12 }}>
      {TABS.map((tab) => (
        <div
          key={tab}
          style={{
            padding: small ? "8px 7px" : "10px 14px",
            fontSize: small ? 13.5 : 16,
            fontWeight: 700,
            color: tab === active ? C.ink : C.inkSoft,
            borderBottom: `3px solid ${tab === active ? C.accent : "transparent"}`,
            marginBottom: -1.5,
          }}
        >
          {tab}
        </div>
      ))}
    </div>
  );
}

/** Score rows: each entry lands when validated; pending ones show a clock. */
function ScoreRows({ t, entries, small }: { t: number; entries: Entry[]; small?: boolean }) {
  const visible = entries.filter((e) => t >= e.at);
  return (
    <>
      {visible
        .slice()
        .reverse()
        .slice(0, small ? 6 : 5)
        .map((e) => {
          const k = ramp(t, e.at, e.at + 0.35);
          const pending = e.sentAt !== undefined && t < e.sentAt;
          const flash = 1 - ramp(t, e.at, e.at + 1.2);
          return (
            <div
              key={`${e.terrain}-${e.at}`}
              style={{
                display: "flex",
                alignItems: "center",
                height: small ? 48 : 50,
                padding: "0 12px",
                marginBottom: 7,
                borderRadius: 12,
                background: `rgba(61,220,138,${0.05 + flash * 0.25})`,
                border: `1.5px solid ${pending ? C.warning + "88" : C.line}`,
                fontSize: small ? 15 : 17,
                fontWeight: 600,
                transform: `translateY(${(1 - k) * -14}px)`,
                opacity: k,
                ...NUM,
              }}
            >
              <span style={{ ...TITLE, color: C.accentInk, width: small ? 40 : 50, fontSize: small ? 18 : 21 }}>T{e.terrain}</span>
              <span style={{ flex: 1 }}>Éq. {e.a}</span>
              <span style={{ ...TITLE, fontSize: small ? 22 : 26, margin: "0 10px" }}>
                <span style={{ color: e.sa > e.sb ? C.ink : C.inkSoft }}>{e.sa}</span>
                <span style={{ color: C.inkSoft }}> – </span>
                <span style={{ color: e.sb > e.sa ? C.ink : C.inkSoft }}>{e.sb}</span>
              </span>
              <span style={{ flex: 1, textAlign: "right" }}>Éq. {e.b}</span>
              <span style={{ width: 30, textAlign: "right", color: pending ? C.warning : C.success, fontWeight: 800 }}>{pending ? "◷" : "✓"}</span>
            </div>
          );
        })}
    </>
  );
}

/** Wide scorers' table (tablet), used in the discovery video. */
export function Board({
  t,
  typing,
  entries,
  state = "live",
  pending = 0,
}: {
  t: number;
  typing: { text: string; from: number; until: number }[];
  entries: Entry[];
  state?: "live" | "offline" | "synced";
  pending?: number;
}) {
  const cur = typing.find((x) => t >= x.from - 0.3 && t < x.until);
  const value = cur ? typed(cur.text, t, cur.from, 8) : "";
  const winners = entries.filter((e) => t >= e.at + 0.3).map((e) => (e.sa > e.sb ? e.a : e.b));
  return (
    <div style={{ position: "absolute", inset: 0, padding: 22, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <Logo size={22} accent={C.accent} />
        <span style={{ marginLeft: 14, fontSize: 16, color: C.inkSoft, fontWeight: 600 }}>Table de marque · 7KQ2</span>
        <span style={{ flex: 1 }} />
        <Witness state={state} pending={pending} />
      </div>
      <Tabs active="Scores" />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: C.inkSoft, fontWeight: 700, marginBottom: 6 }}>Saisie rapide : terrain, score, score</div>
          <div
            style={{
              height: 54,
              borderRadius: 14,
              border: `2px solid ${cur ? C.accent : C.line}`,
              background: C.stage,
              display: "flex",
              alignItems: "center",
              padding: "0 16px",
              ...TITLE,
              fontSize: 30,
              letterSpacing: "0.04em",
              marginBottom: 12,
              boxShadow: cur ? `0 0 0 4px ${C.accent}33` : undefined,
              ...NUM,
            }}
          >
            {value}
            <Caret on={!!cur} />
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: C.inkSoft, letterSpacing: 0 }}>Entrée ↵</span>
          </div>
          <ScoreRows t={t} entries={entries} />
        </div>
        <div style={{ width: 170, marginLeft: 18 }}>
          <div style={{ fontSize: 14, color: C.inkSoft, fontWeight: 700, marginBottom: 6 }}>Tour 3</div>
          {[0, 1, 2, 3].map((i) => {
            const w = winners[i];
            return (
              <div
                key={i}
                style={{
                  height: 38,
                  marginBottom: 8,
                  borderRadius: 10,
                  border: `1.5px solid ${w ? C.accent : C.line}`,
                  background: w ? `${C.accent}22` : "transparent",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 10px",
                  fontSize: 16,
                  fontWeight: 700,
                  color: w ? C.ink : C.inkSoft,
                  ...NUM,
                }}
              >
                {w ? `Éq. ${w}` : "En attente"}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Tutorial screens                                                          */
/* ------------------------------------------------------------------------ */

export function ClubHome({ t, tap }: { t: number; tap: number }) {
  return (
    <Screen>
      <AppBar sub="Espace club" title="La Boule d'Or" right={<Logo size={26} wordmark={false} />} />
      <Button label="+ Créer un concours" color={C.blue} ink="#fff" pressed={press(t, tap)} big style={{ marginBottom: 18 }} />
      <div style={{ fontSize: 14, color: C.inkSoft, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Mes concours</div>
      {[
        ["Grand Prix de printemps", "Terminé · 48 équipes", C.inkSoft],
        ["Concours du jeudi", "Publié · 22 inscrits", C.success],
        ["Challenge des vétérans", "Brouillon", C.warning],
      ].map(([a, b, c]) => (
        <Card key={a} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{a}</div>
          <div style={{ fontSize: 14, color: c, fontWeight: 600, marginTop: 2 }}>{b}</div>
        </Card>
      ))}
      <Card style={{ marginTop: 6, background: C.surface2 }}>
        <div style={{ fontSize: 14, color: C.inkSoft }}>Membres du club</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>4 membres · 2 bénévoles</div>
      </Card>
    </Screen>
  );
}

export function SportChoice({ t, tap, next }: { t: number; tap: number; next: number }) {
  const chosen = ramp(t, tap, tap + 0.2);
  const sport = (name: string, color: string, sub: string, icon: React.ReactNode, active: number) => (
    <div
      style={{
        height: 170,
        borderRadius: 24,
        marginBottom: 14,
        padding: 18,
        background: active ? `linear-gradient(150deg, ${color}, ${color}bb)` : C.surface,
        border: `2px solid ${active ? color : C.line}`,
        color: active ? C.stage : C.ink,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: active ? `0 14px 40px ${color}66` : undefined,
        transform: `scale(${1 + active * 0.02 - press(t, tap) * 0.04 * (active ? 1 : 0)})`,
      }}
    >
      {icon}
      <div>
        <div style={{ ...TITLE, fontSize: 34, lineHeight: 1 }}>{name}</div>
        <div style={{ fontSize: 15, fontWeight: 600, opacity: 0.8 }}>{sub}</div>
      </div>
    </div>
  );
  return (
    <Screen>
      <AppBar sub="Créer un concours · 1/8" title="Quel sport ?" />
      {sport(
        "Pétanque",
        C.accent,
        "Tête-à-tête, doublettes, triplettes",
        <div style={{ width: 54, height: 54, borderRadius: 54, background: "radial-gradient(circle at 35% 30%, #fff, #9aa3cf 45%, #3a4166)" }} />,
        chosen,
      )}
      {sport(
        "Football",
        C.cyan,
        "Foot à 5, à 7, à 11",
        <div style={{ width: 54, height: 54, borderRadius: 54, background: "#fff", border: `6px solid ${C.stage}`, boxShadow: "inset 0 0 0 9px #fff, inset 0 0 0 20px #111" }} />,
        0,
      )}
      <div style={{ fontSize: 15, color: C.inkSoft, textAlign: "center" }}>D'autres sports arrivent bientôt.</div>
      <BottomButton label="Continuer" pressed={press(t, next)} color={chosen ? C.accent : C.surface2} ink={chosen ? C.stage : C.inkSoft} />
    </Screen>
  );
}

const STEPS: Array<{ title: string; body: (t: number) => React.ReactNode }> = [
  {
    title: "Format",
    body: () => (
      <>
        <div style={{ fontSize: 15, color: C.inkSoft, marginBottom: 10 }}>Équipes de</div>
        <Chip label="Tête-à-tête" />
        <Chip label="Doublettes" active />
        <Chip label="Triplettes" />
        <div style={{ fontSize: 15, color: C.inkSoft, margin: "14px 0 10px" }}>Type de concours</div>
        <Chip label="Élimination" active />
        <Chip label="Poules" />
        <Chip label="Suisse" />
        <Card style={{ marginTop: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Nouveau tirage à chaque tour</div>
          <div style={{ fontSize: 13.5, color: C.inkSoft }}>Valeur par défaut en pétanque</div>
        </Card>
      </>
    ),
  },
  {
    title: "Date et heure",
    body: () => (
      <>
        <Field label="Date" value="samedi 14 juin 2027" tag="modifiable" />
        <Field label="Début des parties" value="14 h 00" />
        <Field label="Pointage jusqu'à" value="13 h 30" hint="30 min avant, par défaut" />
      </>
    ),
  },
  {
    title: "Lieu",
    body: () => (
      <>
        <Field label="Adresse" value="Boulodrome municipal" hint="Allée des Platanes, 26000 Valence" />
        <div style={{ height: 150, borderRadius: 16, background: `linear-gradient(135deg, ${C.surface2}, ${C.surface})`, border: `1.5px solid ${C.line}`, position: "relative", overflow: "hidden" }}>
          {[30, 70, 110].map((y) => (
            <div key={y} style={{ position: "absolute", left: 0, right: 0, top: y, height: 2, background: C.line }} />
          ))}
          {[80, 200, 280].map((x) => (
            <div key={x} style={{ position: "absolute", top: 0, bottom: 0, left: x, width: 2, background: C.line }} />
          ))}
          <div style={{ position: "absolute", left: 150, top: 52, width: 26, height: 26, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", background: C.accent, boxShadow: `0 0 20px ${C.accent}` }} />
        </div>
      </>
    ),
  },
  {
    title: "Équipes et inscriptions",
    body: () => (
      <>
        <Field label="Nombre d'équipes maximum" value="64" />
        <Field label="Droit d'inscription" value="10 € par équipe" hint="Réglé sur place, à la table de marque" />
        <Field label="Inscriptions" value="En ligne et sur place" />
      </>
    ),
  },
];

/** The creation form: steps slide, values are prefilled, the draft saves itself. */
export function Wizard({ t, taps }: { t: number; taps: number[] }) {
  const stepAt = taps.filter((x) => t >= x + 0.25).length;
  const step = Math.min(stepAt, STEPS.length - 1);
  const progress = (2 + Math.min(stepAt, STEPS.length - 1) + ramp(t, taps[step] ?? 99, (taps[step] ?? 99) + 0.4)) / 8;
  const toast = Math.max(...taps.map((x) => ramp(t, x + 0.6, x + 0.9) * (1 - ramp(t, x + 2.2, x + 2.5))));
  const minutes = 32 + stepAt;
  return (
    <Screen>
      <AppBar sub={`Créer un concours · ${Math.min(step + 2, 8)}/8`} title="Grand Prix d'automne" />
      <div style={{ height: 8, borderRadius: 4, background: C.surface2, marginBottom: 18 }}>
        <div style={{ height: 8, borderRadius: 4, width: `${progress * 100}%`, background: C.accent, boxShadow: `0 0 12px ${C.accent}` }} />
      </div>
      <div style={{ position: "relative", height: 470, overflow: "hidden" }}>
        {STEPS.map((s, i) => {
          const tIn = i === 0 ? -1 : taps[i - 1] + 0.25;
          const tOut = taps[i] !== undefined ? taps[i] + 0.25 : 999;
          if (t < tIn - 0.05 || t > tOut + 0.5) return null;
          const kin = i === 0 ? 1 : ramp(t, tIn, tIn + 0.4, "inOut");
          const kout = ramp(t, tOut, tOut + 0.4, "inOut");
          return (
            <div key={i} style={{ position: "absolute", inset: 0, transform: `translateX(${(1 - kin) * 340 - kout * 340}px)` }}>
              <div style={{ ...TITLE, fontSize: 24, marginBottom: 12 }}>{s.title}</div>
              {s.body(t)}
            </div>
          );
        })}
      </div>
      <Toast text={`Brouillon enregistré · 14 h ${minutes}`} k={toast} />
      <BottomButton label="Continuer" pressed={Math.max(...taps.map((x) => press(t, x)))} />
    </Screen>
  );
}

/** Terrains step: needs, staggered games, estimated end; « Aide-moi à choisir ». */
export function TerrainsStep({ t, help }: { t: number; help: number }) {
  const value = t < 1.6 ? "32" : t < 2.4 ? "" : typed("20", t, 2.4, 6);
  const line = (at: number) => ({ opacity: ramp(t, at, at + 0.4), transform: `translateY(${(1 - ramp(t, at, at + 0.4)) * 10}px)` });
  const sheet = ramp(t, help + 0.3, help + 0.8);
  return (
    <Screen>
      <AppBar sub="Créer un concours · 6/8" title="Terrains" />
      <Field label="Terrains disponibles" value={<>{value}<Caret on={t > 1.5 && t < 4} /></>} focus={t > 1.5 && t < 4} />
      <Card accent={`${C.accent}66`} style={{ background: `${C.accent}12` }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, ...line(3.6) }}>64 doublettes : 32 terrains nécessaires.</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, color: C.accentInk, ...line(4.6) }}>Vous en avez 20 : 12 parties en décalé.</div>
        <div style={{ fontSize: 17, fontWeight: 700, ...line(5.6) }}>Fin estimée vers 21 h.</div>
      </Card>
      <div style={{ marginTop: 16 }}>
        <Button label="✦ Aide-moi à choisir" color={C.surface2} ink={C.ink} pressed={press(t, help)} style={{ border: `2px solid ${C.blueSoft}` }} />
      </div>
      {sheet > 0 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 330,
            borderRadius: "26px 26px 0 0",
            background: C.surface2,
            borderTop: `2px solid ${C.blueSoft}`,
            padding: 20,
            transform: `translateY(${(1 - sheet) * 340}px)`,
            boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
            zIndex: 5,
          }}
        >
          <div style={{ ...TITLE, fontSize: 22, marginBottom: 8, color: C.blueInk }}>✦ Notre conseil</div>
          <div style={{ fontSize: 16, lineHeight: 1.4, marginBottom: 12 }}>
            Pour 64 doublettes et 20 terrains : <b>élimination avec nouveau tirage</b>, et un <b>complémentaire</b> pour les perdants du 1er tour.
          </div>
          <Chip label="Élimination" active />
          <Chip label="+ complémentaire" active accent={C.blueSoft} />
          <div style={{ fontSize: 14, color: C.inkSoft, marginTop: 6 }}>Fin estimée : 20 h 45</div>
        </div>
      ) : null}
      <BottomButton label="Continuer" />
    </Screen>
  );
}

export function Recap({ t, pay }: { t: number; pay: number }) {
  const code = typed("BIENVENUE", t, 2.2, 7);
  const applied = ramp(t, 3.8, 4.2);
  return (
    <Screen>
      <AppBar sub="Créer un concours · 8/8" title="Récapitulatif" />
      <Card style={{ marginBottom: 12 }}>
        {[
          ["Sport", "Pétanque · doublettes"],
          ["Format", "Élimination + complémentaire"],
          ["Date", "samedi 14 juin · 14 h"],
          ["Équipes", "64 maximum"],
          ["Terrains", "20 · fin vers 21 h"],
        ].map(([a, b]) => (
          <div key={a} style={{ display: "flex", justifyContent: "space-between", fontSize: 15.5, padding: "5px 0", borderBottom: `1px solid ${C.line}` }}>
            <span style={{ color: C.inkSoft }}>{a}</span>
            <span style={{ fontWeight: 700 }}>{b}</span>
          </div>
        ))}
      </Card>
      <Field label="Code promo" value={<>{code}<Caret on={t > 2 && t < 3.9} /><span style={{ flex: 1 }} />{applied > 0 ? <Pill color={C.success} style={{ opacity: applied }}>−20 %</Pill> : null}</>} focus={t > 2 && t < 3.9} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>Lien concours</span>
        <span style={{ ...TITLE, fontSize: 34, ...NUM }}>
          {applied > 0.5 ? (
            <>
              <span style={{ fontSize: 20, color: C.inkSoft, textDecoration: "line-through", marginRight: 8 }}>29 €</span>23,20 €
            </>
          ) : (
            "29 €"
          )}
        </span>
      </div>
      <div style={{ fontSize: 13.5, color: C.inkSoft, marginTop: 4 }}>Paiement unique, sans abonnement.</div>
      <BottomButton label="Payer et publier" pressed={press(t, pay)} />
    </Screen>
  );
}

/** Checkout page (hosted by the payment provider). */
export function Checkout({ t, pay }: { t: number; pay: number }) {
  const card = typed("4242 4242 4242 4242", t, 2.2, 12);
  const done = ramp(t, pay + 0.6, pay + 1.0);
  return (
    <Screen style={{ background: "#f5f6fb", color: "#1a1f36" }}>
      <div style={{ display: "flex", alignItems: "center", fontSize: 14, color: "#5b6180", marginBottom: 6 }}>🔒 Paiement sécurisé · Stripe</div>
      <div style={{ fontSize: 15, color: "#5b6180" }}>La Boule d'Or · Lien concours</div>
      <div style={{ ...TITLE, fontSize: 40, color: "#1a1f36", marginBottom: 14, ...NUM }}>23,20 €</div>
      <div style={{ height: 50, borderRadius: 10, background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Apple Pay</div>
      <div style={{ height: 50, borderRadius: 10, background: "#fff", border: "1.5px solid #d5d8e6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, marginBottom: 14 }}>Google Pay</div>
      <div style={{ textAlign: "center", fontSize: 14, color: "#8a8fa8", marginBottom: 12 }}>ou payer par carte</div>
      {[
        ["E-mail", "club@laboule-dor.fr"],
        ["Carte", card || "1234 1234 1234 1234"],
        ["Expiration · CVC", t > 3.9 ? "12 / 29 · 123" : "MM / AA · CVC"],
      ].map(([a, b], i) => (
        <div key={a} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: "#5b6180", marginBottom: 4 }}>{a}</div>
          <div style={{ height: 44, borderRadius: 8, background: "#fff", border: `1.5px solid ${i === 1 && t > 2 && t < 4 ? C.blue : "#d5d8e6"}`, display: "flex", alignItems: "center", padding: "0 12px", fontSize: 16, color: (i === 1 && !card) || (i === 2 && t <= 3.9) ? "#a3a8c0" : "#1a1f36", ...NUM }}>
            {b}
          </div>
        </div>
      ))}
      <div style={{ position: "absolute", left: 18, right: 18, bottom: 22 }}>
        <Button label={done > 0.5 ? "✓ Paiement accepté" : "Payer 23,20 €"} color={done > 0.5 ? "#1f9d55" : C.blue} ink="#fff" pressed={press(t, pay)} />
      </div>
    </Screen>
  );
}

export function Online({ t }: { t: number }) {
  const k = (at: number) => ({ opacity: ramp(t, at, at + 0.4), transform: `translateY(${(1 - ramp(t, at, at + 0.4)) * 16}px)` });
  return (
    <Screen>
      <div style={{ textAlign: "center", marginTop: 8, ...k(0.1) }}>
        <div style={{ width: 64, height: 64, borderRadius: 64, margin: "0 auto 8px", background: C.success, color: C.stage, fontSize: 36, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 40px ${C.success}` }}>✓</div>
        <div style={{ ...TITLE, fontSize: 36 }}>C'est en ligne !</div>
        <div style={{ fontSize: 15, color: C.inkSoft }}>Grand Prix d'automne est publié.</div>
      </div>
      <Card style={{ marginTop: 16, display: "flex", alignItems: "center", ...k(0.5) }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: C.inkSoft }}>Lien du concours</div>
          <div style={{ ...TITLE, fontSize: 24, color: C.accentInk }}>orgasport.fr/c/7KQ2</div>
        </div>
        <Pill color={C.ink} bg={C.surface2}>Copier</Pill>
      </Card>
      <div style={{ display: "flex", marginTop: 12, ...k(0.9) }}>
        <Card style={{ flex: 1, marginRight: 10, textAlign: "center" }}>
          <QR size={110} seed={11} />
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>QR code</div>
        </Card>
        <Card style={{ flex: 1, textAlign: "center" }}>
          <div style={{ width: 84, height: 110, margin: "0 auto", background: "#f4f6fb", borderRadius: 4, padding: 6 }}>
            <div style={{ height: 8, background: C.accent, borderRadius: 2, marginBottom: 5 }} />
            <div style={{ height: 5, background: C.cobalt, width: "80%", marginBottom: 3 }} />
            <div style={{ height: 5, background: C.cobalt, width: "60%", marginBottom: 8 }} />
            <QR size={44} seed={11} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>Affiche A4</div>
        </Card>
      </div>
      <Card style={{ marginTop: 12, display: "flex", alignItems: "center", ...k(1.3) }}>
        <span style={{ fontSize: 26, marginRight: 12 }}>✉</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Codes PIN envoyés par e-mail</div>
          <div style={{ fontSize: 14, color: C.inkSoft }}>Pour vos bénévoles de la table de marque</div>
        </div>
      </Card>
    </Screen>
  );
}

const TEAMS = [
  ["12", "Dupont – Martin"],
  ["13", "Bernard – Roux"],
  ["14", "Moreau – Simon"],
  ["15", "Laurent – Michel"],
  ["16", "Garcia – David"],
  ["17", "Bertrand – Morel"],
  ["18", "Fournier – Girard"],
];

export function CheckIn({ t, ticks, launch }: { t: number; ticks: number[]; launch: number }) {
  const count = 51 + ticks.filter((x) => t >= x).length;
  return (
    <Screen style={{ padding: "54px 14px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <span style={{ ...TITLE, fontSize: 22, flex: 1 }}>Table de marque</span>
        <Witness state="live" />
      </div>
      <Tabs active="Pointage" small />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, marginBottom: 8, ...NUM }}>
        <span>Équipes présentes</span>
        <span style={{ color: C.success }}>{count} / 64</span>
      </div>
      {TEAMS.map(([n, names], i) => {
        const on = ticks[i] !== undefined && t >= ticks[i];
        const k = ticks[i] !== undefined ? ramp(t, ticks[i], ticks[i] + 0.2) : 0;
        return (
          <div key={n} style={{ display: "flex", alignItems: "center", height: 52, borderBottom: `1px solid ${C.line}`, fontSize: 16 }}>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                marginRight: 12,
                border: `2px solid ${on ? C.success : C.line}`,
                background: on ? C.success : "transparent",
                color: C.stage,
                fontWeight: 900,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `scale(${1 + 0.2 * Math.sin(k * Math.PI)})`,
              }}
            >
              {on ? "✓" : ""}
            </span>
            <span style={{ ...TITLE, width: 52, fontSize: 19, color: C.accentInk }}>Éq. {n}</span>
            <span style={{ fontWeight: 600 }}>{names}</span>
          </div>
        );
      })}
      <BottomButton label="Lancer le tirage" pressed={press(t, launch)} />
    </Screen>
  );
}

export function DrawResult({ t }: { t: number }) {
  const rows = [
    [1, 12, 31], [2, 5, 44], [3, 27, 8], [4, 63, 19], [5, 3, 50], [6, 38, 14], [7, 22, 57], [8, 9, 41], [9, 16, 33], [10, 47, 2],
  ];
  return (
    <Screen style={{ padding: "54px 14px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <span style={{ ...TITLE, fontSize: 22, flex: 1 }}>Table de marque</span>
        <Witness state="live" />
      </div>
      <Tabs active="Tirage" small />
      <div style={{ ...TITLE, fontSize: 22, marginBottom: 2 }}>Tour 1 · tirage fait</div>
      <div style={{ fontSize: 14, color: C.inkSoft, marginBottom: 10 }}>29 parties · 20 terrains · 9 en attente de terrain</div>
      {rows.map(([n, a, b], i) => (
        <div
          key={n}
          style={{
            display: "flex",
            alignItems: "center",
            height: 44,
            borderBottom: `1px solid ${C.line}`,
            fontSize: 16,
            fontWeight: 600,
            opacity: ramp(t, 0.15 + i * 0.12, 0.45 + i * 0.12),
            transform: `translateX(${(1 - ramp(t, 0.15 + i * 0.12, 0.45 + i * 0.12)) * 30}px)`,
            ...NUM,
          }}
        >
          <span style={{ ...TITLE, width: 48, fontSize: 19, color: C.accentInk }}>T{n}</span>
          <span style={{ flex: 1 }}>Éq. {a}</span>
          <span style={{ color: C.inkSoft, margin: "0 8px" }}>contre</span>
          <span style={{ flex: 1, textAlign: "right" }}>Éq. {b}</span>
        </div>
      ))}
    </Screen>
  );
}

export function ScoreEntry({ t, entries, typing }: { t: number; entries: Entry[]; typing: { text: string; from: number; until: number }[] }) {
  const cur = typing.find((x) => t >= x.from - 0.3 && t < x.until);
  return (
    <Screen style={{ padding: "54px 14px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <span style={{ ...TITLE, fontSize: 22, flex: 1 }}>Table de marque</span>
        <Witness state="live" />
      </div>
      <Tabs active="Scores" small />
      <div style={{ fontSize: 14, color: C.inkSoft, fontWeight: 700, marginBottom: 6 }}>Saisie rapide : terrain, score, score</div>
      <div
        style={{
          height: 58,
          borderRadius: 14,
          border: `2px solid ${cur ? C.accent : C.line}`,
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          ...TITLE,
          fontSize: 32,
          letterSpacing: "0.05em",
          marginBottom: 12,
          boxShadow: cur ? `0 0 0 4px ${C.accent}33` : undefined,
          ...NUM,
        }}
      >
        {cur ? typed(cur.text, t, cur.from, 7) : ""}
        <Caret on={!!cur} />
      </div>
      <ScoreRows t={t} entries={entries} small />
    </Screen>
  );
}

export function History({ t, undo }: { t: number; undo: number }) {
  const done = ramp(t, undo + 0.15, undo + 0.4);
  const rows: Array<[string, string, boolean]> = [
    ["15 h 42", "Score terrain 8 : 13 – 2", true],
    ["15 h 41", "Score terrain 5 : 13 – 11", false],
    ["15 h 40", "Score terrain 12 : 13 – 7", false],
    ["15 h 31", "Terrain 4 attribué", false],
    ["14 h 02", "Tirage du tour 1", false],
  ];
  return (
    <Screen style={{ padding: "54px 14px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <span style={{ ...TITLE, fontSize: 22, flex: 1 }}>Table de marque</span>
        <Witness state="live" />
      </div>
      <Tabs active="Historique" small />
      {rows.map(([h, label, target], i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", minHeight: 60, borderBottom: `1px solid ${C.line}`, background: target ? `rgba(255,77,66,${0.12 * (1 - done)})` : undefined, padding: "0 6px", ...NUM }}>
          <span style={{ width: 62, fontSize: 14, color: C.inkSoft, fontWeight: 600 }}>{h}</span>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 600, textDecoration: target && done > 0.5 ? "line-through" : undefined, color: target && done > 0.5 ? C.inkSoft : C.ink }}>{label}</span>
          {target && done > 0.5 ? (
            <Pill color={C.inkSoft} bg={C.surface2}>annulée</Pill>
          ) : (
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                padding: "7px 12px",
                borderRadius: 99,
                border: `1.5px solid ${target ? C.live : C.line}`,
                color: target ? C.live : C.inkSoft,
                transform: `scale(${1 - press(t, undo) * 0.1 * (target ? 1 : 0)})`,
              }}
            >
              Annuler
            </span>
          )}
        </div>
      ))}
      <Toast text="Action annulée : score du terrain 8 retiré" k={ramp(t, undo + 0.4, undo + 0.7)} />
    </Screen>
  );
}

export function PlayerFind({ t, tap }: { t: number; tap: number }) {
  const q = typed("Martin", t, 1.2, 6);
  const res = ramp(t, 2.4, 2.8);
  return (
    <Screen>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <Logo size={20} accent={C.accent} />
        <span style={{ flex: 1 }} />
        <LiveBadge />
      </div>
      <div style={{ ...TITLE, fontSize: 28 }}>Grand Prix d'automne</div>
      <div style={{ fontSize: 15, color: C.inkSoft, marginBottom: 14 }}>Pétanque · doublettes · tour 2</div>
      <Field label="Trouver mon équipe" value={<>{q || <span style={{ color: C.inkSoft, fontWeight: 500 }}>Nom ou numéro</span>}<Caret on={t > 1 && t < 2.6} /></>} focus={t > 1 && t < tap} />
      {res > 0 ? (
        <Card accent={C.accent} style={{ opacity: res, transform: `scale(${1 - press(t, tap) * 0.04})` }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ ...TITLE, fontSize: 26, color: C.accentInk, marginRight: 12 }}>Éq. 12</span>
            <span style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>Dupont – <span style={{ background: `${C.accent}44` }}>Martin</span></span>
            <span style={{ fontSize: 22 }}>›</span>
          </div>
        </Card>
      ) : null}
    </Screen>
  );
}

export function PlayerTeam({ t, notif }: { t: number; notif: number }) {
  const k = ramp(t, notif, notif + 0.5);
  const wiggle = t > notif && t < notif + 0.6 ? Math.sin((t - notif) * 60) * 3 : 0;
  return (
    <Screen>
      <Notification title="À vous ! Terrain 5 · 16 h 20" body="Tour 2 contre Équipe 44 · Leroy – Faure" k={k} style={{ transform: `translateY(${(1 - k) * -130}px) translateX(${wiggle}px)` }} />
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <Logo size={20} accent={C.accent} />
        <span style={{ flex: 1 }} />
        <Pill color={C.accentInk}>C'est mon équipe ★</Pill>
      </div>
      <div style={{ ...TITLE, fontSize: 30 }}>Équipe 12</div>
      <div style={{ fontSize: 16, color: C.inkSoft, marginBottom: 14 }}>Dupont – Martin</div>
      <Card accent={C.success} style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 14, color: C.inkSoft }}>Tour 1 · terrain 12</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Gagné 13 – 7 contre Éq. 31</div>
      </Card>
      <div
        style={{
          borderRadius: 22,
          padding: "16px 18px",
          background: k > 0 ? `linear-gradient(150deg, ${C.accent}, #00c2ff)` : C.surface,
          color: k > 0 ? C.stage : C.ink,
          border: `2px solid ${C.accent}`,
          boxShadow: k > 0 ? `0 14px 40px ${C.accent}77` : undefined,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700 }}>{k > 0 ? "À vous !" : "Prochain match · tour 2"}</div>
        <div style={{ ...TITLE, fontSize: 50, lineHeight: 1, ...NUM }}>Terrain 5</div>
        <div style={{ ...TITLE, fontSize: 28, ...NUM }}>vers 16 h 20</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>contre Équipe 44 · Leroy – Faure</div>
      </div>
    </Screen>
  );
}

export { SCREEN_H };
