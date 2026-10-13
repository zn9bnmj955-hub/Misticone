import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { WorldScene } from "../three/world";
import { C, NUM, SHOTS, TITLE, mix, ramp, useLayout, useTime } from "../theme";
import { Backdrop, Button, Caption, Kinetic, Logo, Phone, Pointer, QR, Shot } from "../ui/kit";
import {
  BOTTOM_BTN,
  CheckIn,
  Checkout,
  ClubHome,
  DrawResult,
  Entry,
  History,
  Online,
  PlayerFind,
  PlayerTeam,
  Recap,
  ScoreEntry,
  Slides,
  SportChoice,
  TerrainsStep,
  Wizard,
} from "../ui/screens";

/** Video 2 — « Acheter et utiliser son lien concours » (docs/videos/storyboard.md). */
export function Tutoriel() {
  return (
    <AbsoluteFill style={{ background: C.stage, color: C.ink, fontFamily: "Saira, system-ui, sans-serif" }}>
      <Audio src={staticFile("music/tutoriel.mp3")} />
      <Shot from={0} to={8} first>
        <Intro />
      </Shot>
      <Shot from={8} to={135}>
        <Steps />
      </Shot>
      <Shot from={135} to={150}>
        <Outro />
      </Shot>
    </AbsoluteFill>
  );
}

function Intro() {
  const t = useTime();
  const { vertical } = useLayout();
  return (
    <>
      <WorldScene t={t} mode="title" vertical={vertical} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(7,12,36,0.55), transparent 70%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 60 }}>
        <div style={{ opacity: ramp(t, 0.4, 1), marginBottom: 22 }}>
          <Logo size={vertical ? 54 : 44} accent={C.amber} />
        </div>
        <div style={{ ...TITLE, fontSize: vertical ? 34 : 28, color: C.amberInk, textTransform: "uppercase", letterSpacing: "0.12em", opacity: ramp(t, 0.8, 1.3), marginBottom: 10 }}>
          Tutoriel
        </div>
        {(vertical ? ["Votre lien concours,", "pas à pas"] : ["Votre lien concours, pas à pas"]).map((line, i) => (
          <Kinetic key={line} words={line} at={1.0 + i * 0.3} size={vertical ? 84 : 96} align="center" style={{ textShadow: "0 6px 40px rgba(7,12,36,0.9)", whiteSpace: "nowrap" }} />
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: C.stage, opacity: 1 - ramp(t, 0, 0.6) }} />
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Steps 1 → 9 (8–135 s): one phone, the interface changes, captions follow  */
/* ------------------------------------------------------------------------ */

const EYEBROWS = ["", "Étape 1", "Étape 1", "Étape 2", "Étape 3", "Étape 4", "Étape 5", "Étape 5", "Côté joueurs", ""];
const T0 = 8;

/** One tap of the finger, in phone-screen coordinates. */
const Tap = ({ at, x, y }: { at: number; x: number; y: number }) => (
  <Pointer path={[[at - 0.8, x + 70, y + 110], [at - 0.1, x, y], [at + 0.6, x + 50, y + 90]]} taps={[at]} />
);

const SCORES: Entry[] = [
  { at: -9, terrain: 3, a: 3, b: 50, sa: 13, sb: 9 },
  { at: -8, terrain: 7, a: 22, b: 57, sa: 11, sb: 13 },
  { at: 2.4, terrain: 12, a: 12, b: 31, sa: 13, sb: 7 },
  { at: 4.6, terrain: 5, a: 5, b: 44, sa: 13, sb: 11 },
  { at: 6.8, terrain: 8, a: 9, b: 41, sa: 13, sb: 2 },
];
const TYPING = [
  { text: "12 13 7", from: 1.0, until: 2.4 },
  { text: "5 13 11", from: 3.2, until: 4.6 },
  { text: "8 13 2", from: 5.6, until: 6.8 },
];
const WIZARD_TAPS = [4.2, 8.6, 13.0, 17.4];
const CHECK_TICKS = [1, 1.5, 2, 2.5, 3.1, 3.6, 4.2];

function PhoneContent({ t }: { t: number }) {
  // t: seconds since 8 s. Each entry: [start, screen].
  return (
    <>
      <Slides
        t={t}
        items={[
          [0, (lt) => <ClubHome t={lt} tap={3.6} />],
          [5, (lt) => <SportChoice t={lt} tap={4.2} next={7.6} />],
          [14, (lt) => <Wizard t={lt} taps={WIZARD_TAPS} />],
          [32, (lt) => <TerrainsStep t={lt} help={9.5} />],
          [47, (lt) => <Recap t={lt} pay={6.6} />],
          [55.2, (lt) => <Checkout t={lt} pay={5.2} />],
          [64, (lt) => <Online t={lt} />],
          [77, (lt) => <CheckIn t={lt} ticks={CHECK_TICKS} launch={9} />],
          [86.5, (lt) => <DrawResult t={lt} />],
          [92, (lt) => <ScoreEntry t={lt} entries={SCORES} typing={TYPING} />],
          [101, (lt) => <History t={lt} undo={5} />],
          [110, (lt) => <PlayerFind t={lt} tap={4.2} />],
          [115.2, (lt) => <PlayerTeam t={lt} notif={4.5} />],
        ]}
      />
      <Tap at={3.6} x={180} y={150} />
      <Tap at={9.2} x={200} y={205} />
      <Tap at={12.6} x={BOTTOM_BTN[0]} y={BOTTOM_BTN[1]} />
      {WIZARD_TAPS.map((x) => (
        <Tap key={x} at={14 + x} x={BOTTOM_BTN[0]} y={BOTTOM_BTN[1]} />
      ))}
      <Tap at={33.4} x={180} y={168} />
      <Tap at={41.5} x={180} y={364} />
      <Tap at={48.8} x={180} y={368} />
      <Tap at={53.6} x={BOTTOM_BTN[0]} y={BOTTOM_BTN[1]} />
      <Tap at={57.0} x={180} y={421} />
      <Tap at={60.4} x={BOTTOM_BTN[0]} y={BOTTOM_BTN[1]} />
      {CHECK_TICKS.map((x, i) => (
        <Tap key={x} at={77 + x} x={30} y={202 + i * 52} />
      ))}
      <Tap at={86} x={BOTTOM_BTN[0]} y={BOTTOM_BTN[1]} />
      <Tap at={106} x={300} y={174} />
      <Tap at={110.8} x={180} y={205} />
      <Tap at={114.2} x={180} y={290} />
    </>
  );
}

/** Floating cards that echo the key information outside the phone. */
type Pop = { from: number; to: number; h: [number, number]; v: [number, number]; node: React.ReactNode; w: number };

const POPS: Pop[] = [
  {
    from: 26.6,
    to: 30.0,
    w: 360,
    h: [80, 470],
    v: [40, 1060],
    node: <PopCard icon="✓" color={C.success} title="Brouillon enregistré" sub="Vous pouvez reprendre plus tard" />,
  },
  {
    from: 45.8,
    to: 51.5,
    w: 380,
    h: [80, 470],
    v: [300, 1050],
    node: <PopCard icon="◷" color={C.amber} title="Fin estimée vers 21 h" sub="32 terrains nécessaires · 20 disponibles" />,
  },
  {
    from: 64.2,
    to: 70.6,
    w: 400,
    h: [80, 470],
    v: [300, 470],
    node: <PopCard icon="🔒" color={C.blueSoft} title="Paiement sécurisé" sub="Aucune donnée bancaire chez OrgaSport" />,
  },
  {
    from: 73.2,
    to: 84.4,
    w: 220,
    h: [600, 345],
    v: [470, 960],
    node: <PopPoster />,
  },
  {
    from: 74.4,
    to: 84.4,
    w: 380,
    h: [80, 470],
    v: [30, 1080],
    node: <PopCard icon="✉" color={C.blueSoft} title="Codes PIN des bénévoles" sub="4821 · 7305 · 1962 — reçus par e-mail" />,
  },
  {
    from: 95.2,
    to: 99.6,
    w: 380,
    h: [80, 470],
    v: [300, 1080],
    node: <PopCard icon="⚡" color={C.amber} title="Tirage fait en 1 seconde" sub="29 parties · terrains attribués" />,
  },
  {
    from: 111,
    to: 117.6,
    w: 380,
    h: [80, 470],
    v: [40, 1080],
    node: <PopCard icon="↶" color={C.live} title="Tout est dans l'historique" sub="Chaque action peut être annulée" />,
  },
  {
    from: 128.2,
    to: 134,
    w: 400,
    h: [80, 470],
    v: [300, 1080],
    node: <PopCard icon="🔔" color={C.amber} title="« À vous ! Terrain 5 »" sub="Les équipes sont prévenues sur leur téléphone" />,
  },
];

function PopCard({ icon, color, title, sub }: { icon: string; color: string; title: string; sub: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "16px 20px",
        borderRadius: 22,
        background: "rgba(15,23,54,0.94)",
        border: `2px solid ${color}88`,
        boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 40px ${color}44`,
        fontFamily: "Saira",
        color: C.ink,
      }}
    >
      <div style={{ width: 54, height: 54, borderRadius: 16, background: `${color}26`, color, fontSize: 30, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 16, flex: "none" }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...TITLE, fontSize: 28, lineHeight: 1.05 }}>{title}</div>
        <div style={{ fontSize: 17, color: C.inkSoft, fontWeight: 600 }}>{sub}</div>
      </div>
    </div>
  );
}

function PopPoster() {
  return (
    <div style={{ width: 220, height: 311, background: "#f3f1ea", borderRadius: 6, padding: 16, color: C.cobalt, fontFamily: "Saira", boxShadow: `0 30px 70px rgba(0,0,0,0.55), 0 0 60px ${C.amber}55` }}>
      <div style={{ height: 12, background: C.amber, borderRadius: 3, marginBottom: 10 }} />
      <div style={{ ...TITLE, fontSize: 28, lineHeight: 0.95 }}>GRAND PRIX D'AUTOMNE</div>
      <div style={{ fontSize: 14, fontWeight: 700, margin: "8px 0", ...NUM }}>Samedi 14 juin · 14 h · doublettes</div>
      <QR size={110} seed={11} style={{ display: "block", margin: "6px auto" }} />
      <div style={{ ...TITLE, fontSize: 17, textAlign: "center" }}>orgasport.fr/c/7KQ2</div>
      <div style={{ fontSize: 11, textAlign: "center", marginTop: 4 }}>Affiche A4 prête à imprimer</div>
    </div>
  );
}

function Steps() {
  const t = useTime();
  const T = T0 + t;
  const { vertical } = useLayout();
  const shots = SHOTS.tutoriel;
  // The phone turns a little at each step.
  const angles = [0, -14, 10, -12, 8, -10, 12, -8, 10, 0];
  let rot = 0;
  for (let i = 1; i < shots.length - 1; i++) rot = mix(rot, angles[i], ramp(T, shots[i].start - 0.4, shots[i].start + 0.8, "inOut"));
  const enter = ramp(t, 0, 1.4);
  const exit = ramp(t, 126.2, 127.4, "inOut");
  const float = Math.sin(t * 0.9) * 7;
  const P = vertical ? { cx: 360, cy: 790, s: 1.0 } : { cx: 905, cy: 362, s: 0.86 };
  const accent = T >= 72 && T < 85 ? C.success : C.amber;
  return (
    <>
      <Backdrop accent={C.blueSoft} speed={0.35} glow={0.8} />
      <div style={{ position: "absolute", inset: 0, perspective: 1800 }}>
        <Phone
          scale={P.s * mix(0.6, 1, enter) * mix(1, 0.7, exit)}
          glow={accent}
          time={T < 85 ? "14:32" : "15:41"}
          style={{
            left: P.cx - 192,
            top: P.cy - 392 + float + (1 - enter) * 300 + exit * 200,
            opacity: 1 - exit,
            transform: `rotateY(${rot}deg) rotateX(${mix(30, 4, enter)}deg)`,
          }}
        >
          <PhoneContent t={t} />
        </Phone>
      </div>
      {shots.slice(1, -1).map((s, i) => {
        const idx = i + 1;
        if (T < s.start - 0.5 || T > s.end + 0.6) return null;
        const text = s.screen.replace(/^\d+\.\s*/, "");
        return (
          <Caption
            key={idx}
            words={text}
            at={s.start - T0 + 0.35}
            out={s.end - T0 - 0.45}
            eyebrow={EYEBROWS[idx]}
            accent={idx === 5 ? C.success : idx === 8 ? C.blueSoft : C.amber}
            place={vertical ? "top" : "leftTop"}
            size={vertical ? (text.length > 34 ? 58 : 66) : text.length > 34 ? 54 : 62}
          />
        );
      })}
      {POPS.map((p, i) => {
        if (T < p.from - 0.1 || T > p.to + 0.5) return null;
        const k = ramp(T, p.from, p.from + 0.6) * (1 - ramp(T, p.to, p.to + 0.45, "inOut"));
        const [x, y] = vertical ? p.v : p.h;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y + Math.sin(t * 1.4 + i) * 5,
              width: p.w,
              opacity: k,
              transform: `perspective(1000px) translateZ(${(1 - k) * -300}px) rotateY(${(1 - k) * 30 + (vertical ? 0 : 6)}deg)`,
              filter: k < 1 ? `blur(${(1 - k) * 8}px)` : undefined,
              zIndex: 60,
            }}
          >
            {p.node}
          </div>
        );
      })}
    </>
  );
}

function Outro() {
  const t = useTime();
  const { vertical } = useLayout();
  return (
    <>
      <WorldScene t={t} mode="outro" vertical={vertical} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(7,12,36,0.6), transparent 70%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: vertical ? "flex-start" : "center", paddingTop: vertical ? 200 : 0 }}>
        <div style={{ opacity: ramp(t, 0.6, 1.2), transform: `scale(${mix(0.85, 1, ramp(t, 0.6, 1.4))})` }}>
          <Logo size={vertical ? 70 : 60} accent={C.amber} />
        </div>
        <Kinetic words="À vous de jouer !" at={1.4} size={vertical ? 64 : 56} color={C.amberInk} align="center" style={{ marginTop: 26 }} />
        <Kinetic words="Créez votre premier concours" at={2.2} size={vertical ? 82 : 84} align="center" style={{ maxWidth: vertical ? 620 : 1100, marginTop: 6, textShadow: "0 6px 40px rgba(7,12,36,0.9)" }} />
        <div style={{ marginTop: 34, opacity: ramp(t, 3.4, 4), transform: `translateY(${(1 - ramp(t, 3.4, 4)) * 20}px)` }}>
          <Button label="orgasport.fr · Créer un concours →" color={C.amber} big style={{ padding: "0 34px", fontSize: vertical ? 30 : 28 }} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: C.stage, opacity: ramp(t, 14, 15) }} />
    </>
  );
}
