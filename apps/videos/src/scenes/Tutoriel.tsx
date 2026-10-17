import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { TutoWorld } from "../three/tuto-world";
import { C, FPS, SHOTS, TITLE, mix, mixColor, ramp, useLayout, useTime } from "../theme";
import { Button, Caption, Kinetic, Logo, Phone, Pointer, SCREEN_H, SCREEN_W, Shot } from "../ui/kit";
import { At, BankCard, FieldCard, Fly, InfoCard, LineCard, PERSPECTIVE, Padlock, Poster, QRTile, RewindRing, SportTile, lerpPose, poseAt, type Pose } from "./tuto3d";
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
      <World />
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

/** The 3D world runs under every shot, so the camera moves continuously. */
function World() {
  const frame = useCurrentFrame();
  const { vertical } = useLayout();
  const T = frame / FPS;
  return (
    <>
      <TutoWorld T={T} vertical={vertical} />
      <AbsoluteFill style={{ background: C.stage, opacity: 1 - ramp(T, 0, 0.8) + ramp(T, 149, 150) }} />
    </>
  );
}

function Intro() {
  const t = useTime();
  const { vertical } = useLayout();
  return (
    <>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(4,6,12,0.7) 0%, rgba(4,6,12,0.25) 45%, transparent 65%)", opacity: 1 - ramp(t, 7.4, 8.4) }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", padding: vertical ? "200px 40px 0" : "70px 60px 0", opacity: 1 - ramp(t, 7.4, 8.2) }}>
        <div style={{ opacity: ramp(t, 0.4, 1), marginBottom: 22 }}>
          <Logo size={vertical ? 54 : 44} accent={C.accent} />
        </div>
        <div style={{ ...TITLE, fontSize: vertical ? 34 : 28, color: C.accentInk, textTransform: "uppercase", letterSpacing: "0.12em", opacity: ramp(t, 0.8, 1.3), marginBottom: 10 }}>
          Tutoriel
        </div>
        {(vertical ? ["Votre lien concours,", "pas à pas"] : ["Votre lien concours, pas à pas"]).map((line, i) => (
          <Kinetic key={line} words={line} at={1.0 + i * 0.3} size={vertical ? 84 : 96} align="center" style={{ textShadow: "0 6px 40px rgba(4,6,12,0.9)", whiteSpace: "nowrap" }} />
        ))}
      </AbsoluteFill>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Steps 1 → 9 (8–135 s): the phone is a 3D object, the interface changes   */
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

/* ------------------------------------------------------------------------ */
/* 3D chapters: the phone is an object in space, cards fly out of its screen */
/* ------------------------------------------------------------------------ */

type K = Array<[number, Pose]>;
const P = (x: number, y: number, z = 0, rx = 0, ry = 0, extra: Partial<Pose> = {}): Pose => ({ x, y, z, rx, ry, ...extra });

/** Phone poses, 16:9 (phone on the right, cards assemble on the left). */
function phoneKeysH(): K {
  const s = 0.86;
  const p = (x: number, y: number, z: number, rx: number, ry: number, o = 1): Pose => ({ x, y, z, rx, ry, s, o });
  const base = p(940, 362, -40, 4, 16);
  const side = p(960, 362, -70, 4, 24);
  return [
    [8, p(930, 920, -700, 40, 34, 0)],
    [9.6, p(930, 362, 0, 6, 14)],
    [12.8, p(930, 362, 0, 4, 10)],
    [13.8, side],
    [39.6, side],
    [41.2, p(1120, 430, -520, 26, 36)],
    [54.4, p(1120, 430, -520, 26, 36)],
    [55.6, base],
    [62.9, base],
    [63.8, side],
    [84.6, side],
    [85.6, base],
    [93.6, base],
    [94.4, side],
    [113.9, side],
    [114.5, p(960, 362, -280, 2, 36)],
    [115.6, side],
    [117.6, side],
    [118.6, p(930, 362, 0, 2, 10)],
    [123.6, side],
    [134.0, side],
    [135.3, p(930, 880, -520, 34, 24, 0)],
  ];
}

/** Phone poses, 9:16 (phone below; it steps back while the cards are out). */
function phoneKeysV(): K {
  const s = 0.96;
  const p = (y: number, z: number, rx: number, ry: number, o = 1): Pose => ({ x: 360, y, z, rx, ry, s, o });
  const back = p(960, -420, 8, 10);
  return [
    [8, p(1500, -700, 40, 20, 0)],
    [9.6, p(790, 0, 6, 10)],
    [10.2, p(790, 0, 6, 10)],
    [11.0, back],
    [39.6, back],
    [41.2, p(1080, -900, 30, 22)],
    [54.4, p(1080, -900, 30, 22)],
    [55.6, back],
    [117.6, back],
    [118.6, p(790, 0, 4, 6)],
    [123.8, back],
    [134.0, back],
    [135.3, p(1500, -600, 30, 20, 0)],
  ];
}

function Steps() {
  const t = useTime();
  const T = T0 + t;
  const { vertical: v } = useLayout();
  const keys = React.useMemo(() => (v ? phoneKeysV() : phoneKeysH()), [v]);
  const ph = (at: number): Pose => {
    const q = poseAt(keys, at);
    return { ...q, z: q.z + 30, s: 1 };
  };
  const phone = poseAt(keys, T);
  phone.y += Math.sin(t * 0.9) * 6;
  phone.ry += Math.sin(t * 0.37) * 2.5;
  const L = (h: Pose, vv: Pose) => (v ? vv : h);
  const W = (h: number, vv: number) => (v ? vv : h);
  const shots = SHOTS.tutoriel;

  const cards: React.ReactNode[] = [];
  const fly = (key: string, at: number, out: number, to: Pose, node: React.ReactNode, extra: { from?: Pose; arc?: number; dur?: number } = {}) =>
    cards.push(
      <Fly key={key} T={T} at={at} out={out} from={extra.from ?? ph(at)} to={to} arc={extra.arc} dur={extra.dur}>
        {node}
      </Fly>,
    );

  // 1. Create: the button, then the two sports.
  fly("create", 10.6, 12.9, L(P(350, 520, 0, 0, -8), P(360, 540, 0, 0, 0)), <InfoCard v={v} w={W(480, 600)} icon="+" title="Créer un concours" sub="Espace club · La Boule d'Or" />);
  const chosen = ramp(T, 17.0, 17.4);
  fly("petanque", 13.6, 21.4, L(P(220, 500, chosen * 60, 0, -10), P(200, 560, chosen * 60, 0, 6)), <SportTile v={v} w={W(230, 280)} label="Pétanque" steel active={chosen} />);
  fly(
    "foot",
    13.9,
    21.4,
    L(P(480, 500, -chosen * 160, 0, -10, { o: mix(1, 0.4, chosen) }), P(520, 560, -chosen * 160, 0, -6, { o: mix(1, 0.4, chosen) })),
    <SportTile v={v} w={W(230, 280)} label="Football" active={0} />,
  );

  // 2. Wizard: each answer flies out and the fields assemble in depth.
  const FIELDS = [
    { at: 26.3, label: "Format", value: "Doublettes · élimination" },
    { at: 30.7, label: "Date", value: "Sam. 14 juin · 14 h 00" },
    { at: 35.1, label: "Concours B", value: "Perdants de la 1re partie" },
    { at: 39.5, label: "Équipes", value: "64 maximum" },
  ];
  FIELDS.forEach((f, j) => {
    const slot = FIELDS.slice(j + 1).reduce((n, g) => n + ramp(T, g.at, g.at + 0.7, "inOut"), 0);
    const to = L(P(350, 640 - slot * 68, -slot * 130, 0, -8), P(360, 760 - slot * 104, -slot * 110, 0, 0));
    fly(`f${j}`, f.at, 40.0, to, <FieldCard v={v} w={W(520, 620)} label={f.label} value={f.value} saved={ramp(T, f.at + 0.6, f.at + 1)} />);
  });

  // 3. Terrains: the neon field lights up (3D world) + the figures.
  fly("need", 43.7, 54.3, L(P(330, 430, 0, 0, -8), P(360, 450, 0, 0, 0)), <InfoCard v={v} w={W(500, 620)} icon="▦" title="32 terrains nécessaires" sub="64 doublettes" />);
  fly("have", 44.7, 54.3, L(P(330, 535, 0, 0, -8), P(360, 580, 0, 0, 0)), <InfoCard v={v} w={W(500, 620)} color={C.cyan} icon="◫" title="20 disponibles" sub="12 parties en décalé" />);
  fly("end", 45.7, 54.3, L(P(330, 640, 0, 0, -8), P(360, 710, 0, 0, 0)), <InfoCard v={v} w={W(500, 620)} icon="✦" title="« Aide-moi à choisir »" sub="le bon format en un clic" />);

  // 4. Recap and payment: price, then a 3D bank card that goes into a padlock.
  const promo = ramp(T, 58.8, 59.2);
  fly(
    "price",
    56.2,
    63.0,
    L(P(340, 520, 0, 0, -8), P(360, 560, 0, 0, 0)),
    <InfoCard
      v={v}
      w={W(500, 620)}
      icon="€"
      title={promo > 0.5 ? <>Lien concours · <s style={{ color: C.inkSoft }}>29 €</s> 23,20 €</> : "Lien concours · 29 €"}
      sub={promo > 0.5 ? "Code BIENVENUE · −20 %" : "Paiement unique, sans abonnement"}
    />,
  );
  const pay = 68.4;
  const swing = Math.sin(T * 1.1) * 10;
  const lockPose = L(P(565, 455, 40, 0, -20 + swing), P(560, 560, 40, 0, -20 + swing));
  const intoLock = ramp(T, pay, pay + 0.6, "inOut");
  const cardTo = lerpPose(L(P(290, 470, 20, 8, -24 + swing * 1.5), P(240, 570, 20, 8, -24 + swing * 1.5)), { ...lockPose, s: 0.3, o: 0, rx: 70 }, intoLock);
  fly("card", 63.7, 71.6, cardTo, <BankCard v={v} w={W(330, 300)} shine={ramp(T, 64.6, 66.2)} />, { dur: 1.2 });
  const closed = ramp(T, pay + 0.45, pay + 0.75);
  fly("lock", 64.0, 71.6, lockPose, <Padlock size={W(110, 120)} closed={closed} glow={ramp(T, pay + 0.7, pay + 1.1)} />, { dur: 1.1 });
  fly("secure", 69.2, 71.6, L(P(370, 625, 0, 0, -6), P(360, 780, 0, 0, 0)), <InfoCard v={v} w={W(580, 640)} color={C.cyan} icon="✓" title="Paiement sécurisé" sub="Aucune donnée bancaire chez OrgaSport" />);

  // 5. Online: link, QR code and poster fly out of the screen; then the PIN codes.
  fly("link", 72.9, 84.4, L(P(390, 628, 0, 0, -8), P(360, 800, 0, 0, 0)), <InfoCard v={v} w={W(480, 600)} color={C.cyan} icon="↗" title="orgasport.fr/c/7KQ2" sub="Votre lien concours" />);
  fly("qr", 73.5, 79.2, L(P(475, 455, 30, 4, -16 + swing * 0.6), P(510, 545, 30, 4, -14 + swing * 0.6)), <QRTile v={v} size={W(150, 170)} />);
  fly("poster", 73.9, 79.2, L(P(215, 480, -20, 2, 18 - swing * 0.6), P(200, 555, -20, 2, 16 - swing * 0.6)), <Poster v={v} w={W(200, 220)} />);
  fly("pins", 79.6, 84.4, L(P(360, 470, 0, 0, -8), P(360, 560, 0, 0, 0)), <InfoCard v={v} w={W(540, 640)} icon="✉" title="Codes PIN des bénévoles" sub="4821 · 7305 · 1962 — par e-mail" />);

  // 6. Check-in (teams tick in), then the draw cascades in depth.
  [12, 13, 14, 15, 16, 17, 18].forEach((n, i) => {
    const at = 85 + CHECK_TICKS[i] + 0.1;
    const col = i % 2;
    const row = Math.floor(i / 2);
    fly(
      `ci${n}`,
      at,
      93.6,
      L(P(220 + col * 270, 410 + row * 75, -row * 30, 0, -8), P(200 + col * 320, 450 + row * 92, -row * 30, 0, 0)),
      <LineCard v={v} w={W(250, 300)} color={C.success} tag="✓" text={`Éq. ${n}`} />,
      { arc: 160, dur: 0.7 },
    );
  });
  [[1, 12, 31], [2, 5, 44], [3, 27, 8]].forEach(([n, a, b], i) => {
    fly(`d${n}`, 94.7 + i * 0.15, 99.6, L(P(330, 405 + i * 70, -i * 40, 0, -8), P(360, 460 + i * 92, -i * 40, 0, 0)), <LineCard v={v} w={W(480, 600)} tag={`T.${n}`} text={`${a} contre ${b}`} />, { arc: 340 });
  });
  fly("drawn", 95.3, 99.6, L(P(340, 642, 0, 0, -6), P(360, 770, 0, 0, 0)), <InfoCard v={v} w={W(520, 620)} color={C.cyan} icon="✦" title="Résultats 1re partie" sub="32 parties · cadrage ensuite, tout seul" />);

  // 7. Scores fly out one by one and become the history; « undo » rewinds the last one.
  const UNDO = 114.2;
  const ROWS = [
    { at: 102.5, time: "15 h 40", text: "Terrain 12 · 13 – 7" },
    { at: 104.7, time: "15 h 41", text: "Terrain 5 · 13 – 11" },
    { at: 106.9, time: "15 h 42", text: "Terrain 8 · 13 – 2", target: true },
    { at: 109.3, time: "15 h 31", text: "Terrain 4 attribué", old: 3 },
    { at: 109.5, time: "14 h 02", text: "Tirage du tour 1", old: 4 },
  ];
  const back = ramp(T, UNDO + 0.35, UNDO + 1.0, "inOut");
  ROWS.forEach((r, j) => {
    if (!v && r.old === 4) return; // 16:9: four rows, the caption needs the top of the frame.
    let slot = r.old ?? ROWS.slice(j + 1, 3).reduce((n, g) => n + ramp(T, g.at, g.at + 0.6, "inOut"), 0);
    if (!r.target) slot -= back;
    const to = L(P(350, 535 - slot * 46, -slot * 150, 0, -8), P(360, 720 - slot * 78, -slot * 130, 0, 0));
    const strike = r.target ? ramp(T, UNDO, UNDO + 0.3) : 0;
    const node = <LineCard v={v} w={W(500, 620)} color={r.target ? mixColor(C.accent, C.live, strike) : C.accent} tag={r.time} text={r.text} strike={strike} dim={strike} />;
    const from = r.old ? { ...to, z: to.z - 700, o: 0 } : undefined;
    if (r.target) {
      // Rewind: the undone action flips and flies back into the depth, leaving a trail.
      const ghosts = [0.24, 0.16, 0.08, 0];
      ghosts.forEach((d, g) => {
        const e = ramp(T, UNDO + 0.35 - d, UNDO + 1.2 - d, "inOut");
        if (g < 3 && (e <= 0 || e >= 1)) return;
        const q: Pose = { ...to, z: to.z - e * 1300, y: to.y - e * 240, rx: to.rx + e * 60, o: (g === 3 ? 1 : 0.28 - g * 0.07) * (1 - e) };
        fly(`h${j}-${g}`, r.at, 117.6, q, node);
      });
    } else fly(`h${j}`, r.at, 117.6, to, node, { from });
  });
  fly("hist", 111, 117.6, L(P(370, 638, 40, 0, -6), P(360, 860, 40, 0, 0)), <InfoCard v={v} w={W(580, 640)} color={C.cyan} icon="↶" title="Tout est dans l'historique" sub="Chaque action peut être annulée" />);
  const ring = ramp(T, UNDO - 0.3, UNDO + 0.1) * (1 - ramp(T, UNDO + 1.4, UNDO + 1.9));
  if (ring > 0)
    cards.push(
      <At key="ring" pose={{ ...L(P(600, 450, 120, 0, -10), P(600, 520, 120, 0, 0)), s: mix(0.6, 1, ring), o: ring }} z={40}>
        <RewindRing size={W(130, 150)} k={1} spin={ramp(T, UNDO - 0.2, UNDO + 1.4, "inOut") * 720} />
      </At>,
    );

  // 8. Players: next match, then « it's your turn ».
  fly("next", 124.4, 134, L(P(350, 450, 0, 0, -8), P(360, 520, 0, 0, 0)), <InfoCard v={v} w={W(540, 640)} icon="▸" title="Terrain 5 · 2e partie" sub="Contre l'équipe 44" />);
  fly("notif", 128.2, 134, L(P(350, 600, 60, 0, -6), P(360, 700, 60, 0, 0)), <InfoCard v={v} w={W(540, 640)} color={C.cyan} icon="!" title="« À vous ! Terrain 5 »" sub="Les équipes sont prévenues sur leur téléphone" />, { arc: 420 });

  return (
    <>
      <AbsoluteFill style={{ background: v ? "linear-gradient(180deg, rgba(4,6,12,0.75) 0%, rgba(4,6,12,0.2) 40%, transparent 70%)" : "linear-gradient(90deg, rgba(4,6,12,0.7) 0%, rgba(4,6,12,0.25) 50%, transparent 70%)" }} />
      <div style={{ position: "absolute", inset: 0, perspective: PERSPECTIVE, overflow: "hidden" }}>
        <At pose={phone} z={5}>
          <div style={{ position: "relative", width: SCREEN_W + 24, height: SCREEN_H + 24 }}>
            <Phone glow={C.accent} time={T < 85 ? "14:32" : "15:41"} style={{ left: 0, top: 0 }}>
              <PhoneContent t={t} />
            </Phone>
          </div>
        </At>
        {cards}
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
            accent={idx === 5 || idx === 8 ? C.cyan : C.accent}
            place={v ? "top" : "leftTop"}
            size={v ? (text.length > 34 ? 58 : 66) : text.length > 34 ? 54 : 62}
          />
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
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(4,6,12,0.75) 0%, rgba(4,6,12,0.35) 55%, transparent 80%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: vertical ? 200 : 60 }}>
        <div style={{ opacity: ramp(t, 0.6, 1.2), transform: `scale(${mix(0.85, 1, ramp(t, 0.6, 1.4))})` }}>
          <Logo size={vertical ? 70 : 60} accent={C.accent} />
        </div>
        <Kinetic words="À vous de jouer !" at={1.4} size={vertical ? 64 : 56} color={C.accentInk} align="center" style={{ marginTop: 26 }} />
        <Kinetic words="Créez votre premier concours" at={2.2} size={vertical ? 82 : 84} align="center" style={{ maxWidth: vertical ? 620 : 1100, marginTop: 6, textShadow: "0 6px 40px rgba(4,6,12,0.9)" }} />
        <div style={{ marginTop: 34, opacity: ramp(t, 3.4, 4), transform: `translateY(${(1 - ramp(t, 3.4, 4)) * 20}px)` }}>
          <Button label="orgasport.fr · Créer un concours →" color={C.accent} big style={{ padding: "0 34px", fontSize: vertical ? 30 : 28 }} />
        </div>
      </AbsoluteFill>
    </>
  );
}
