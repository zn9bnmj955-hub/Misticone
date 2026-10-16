import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { BracketScene, FranceScene, MorphScene, WorldScene } from "../three/world";
import { C, NUM, TITLE, clamp01, mix, mixColor, rand, ramp, useLayout, useTime } from "../theme";
import { Backdrop, Beam, Button, Caption, Card, Dot, Kinetic, Logo, Panel, Phone, Pointer, QR, Shot } from "../ui/kit";
import { Board, Entry, ScanScreen, TerrainPage } from "../ui/screens";

/** Video 1 — « OrgaSport en 75 secondes » (docs/videos/storyboard.md). */
export function Decouverte() {
  return (
    <AbsoluteFill style={{ background: C.stage, color: C.ink, fontFamily: "Saira, system-ui, sans-serif" }}>
      <Audio src={staticFile("music/decouverte.mp3")} />
      <Shot from={0} to={14} first>
        <Opening />
      </Shot>
      <Shot from={14} to={22}>
        <Scan />
      </Shot>
      <Shot from={22} to={32}>
        <Bracket />
      </Shot>
      <Shot from={32} to={40}>
        <ScoreTable />
      </Shot>
      <Shot from={40} to={47}>
        <Offline />
      </Shot>
      <Shot from={47} to={55}>
        <Morph />
      </Shot>
      <Shot from={55} to={65}>
        <ClubCreate />
      </Shot>
      <Shot from={65} to={75}>
        <Finale />
      </Shot>
    </AbsoluteFill>
  );
}

/* 0–14 s: the ball drops, the boulodrome lights up, flyover. */
function Opening() {
  const t = useTime();
  const { vertical } = useLayout();
  return (
    <>
      <WorldScene t={t} mode="drop" vertical={vertical} />
      <Caption words="Le jour du concours…" at={3.1} out={5.4} accent={C.accent} />
      <Stats />
      <AbsoluteFill style={{ background: C.stage, opacity: 1 - ramp(t, 0, 0.6) }} />
    </>
  );
}

function Stats() {
  const t = useTime();
  const { vertical } = useLayout();
  const items: Array<[number, string]> = [
    [64, "équipes"],
    [32, "terrains"],
    [1, "tirage"],
  ];
  const exit = ramp(t, 13.1, 13.6);
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: vertical ? "flex-start" : "baseline",
        ...(vertical ? { left: 56, top: 120 } : { left: 72, bottom: 56 }),
        opacity: 1 - exit,
      }}
    >
      {items.map(([n, label], i) => {
        const at = 6.9 + i * 0.45;
        const k = ramp(t, at, at + 0.6);
        const count = Math.round(n * ramp(t, at, at + 1.3, "out"));
        return (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "baseline",
              marginRight: vertical ? 0 : 44,
              marginBottom: vertical ? 4 : 0,
              opacity: k,
              transform: `translateY(${(1 - k) * 30}px)`,
              filter: k < 1 ? `blur(${(1 - k) * 10}px)` : undefined,
            }}
          >
            <span style={{ ...TITLE, ...NUM, fontSize: vertical ? 120 : 104, lineHeight: 0.95, color: i === 2 ? C.accent : C.ink, textShadow: "0 6px 30px rgba(4,6,12,0.9)", minWidth: vertical ? 150 : undefined }}>
              {count}
            </span>
            <span style={{ ...TITLE, fontSize: vertical ? 54 : 40, marginLeft: 12, color: C.inkSoft, textShadow: "0 4px 20px rgba(4,6,12,0.9)" }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* 14–22 s: the camera dives to a floating phone: QR scan, then « À vous ! ». */
function Scan() {
  const t = useTime();
  const { vertical } = useLayout();
  const fly = ramp(t, 0, 1.6);
  const open = 3.2;
  const found = t >= open + 0.6;
  const watch = Math.min(t, open + 0.6) * 2.1;
  const float = Math.sin(t * 1.2) * 6;
  const cx = vertical ? 360 : 890;
  const cy = vertical ? 800 : 360;
  const scale = (vertical ? 1.06 : 0.84) * mix(0.35, 1, fly);
  return (
    <>
      <Backdrop accent={C.accent} speed={1.6 - fly} />
      <div style={{ position: "absolute", inset: 0, perspective: 1600 }}>
        <Phone
          scale={scale}
          glow={C.accent}
          style={{
            left: cx - 192,
            top: cy - 392 + float + (1 - fly) * 260,
            transform: `rotateX(${mix(55, 6, fly)}deg) rotateY(${mix(-35, vertical ? -6 : -14, fly)}deg) rotateZ(${mix(12, 0, fly)}deg)`,
          }}
        >
          {t < open + 0.6 ? <ScanScreen t={t} /> : null}
          {t >= open ? (
            <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - ramp(t, open, open + 0.6, "inOut")) * 760}px)` }}>
              <TerrainPage t={t - open - 0.3} highlight={ramp(t, open + 1.2, open + 1.6) * (1 - ramp(t, open + 2.4, open + 3))} />
            </div>
          ) : null}
        </Phone>
      </div>
      <Caption words="Votre match en 10 secondes." at={0.8} place={vertical ? "top" : "left"} accent={C.accent} />
      <div
        style={{
          position: "absolute",
          ...(vertical ? { left: 48, top: 300 } : { left: 80, top: 470 }),
          display: "flex",
          alignItems: "center",
          padding: "10px 20px",
          borderRadius: 999,
          background: found ? `${C.success}26` : "rgba(15,23,54,0.85)",
          border: `2px solid ${found ? C.success : C.line}`,
          opacity: ramp(t, 1.2, 1.6),
          ...TITLE,
          fontSize: vertical ? 34 : 30,
          color: found ? C.success : C.ink,
          ...NUM,
        }}
      >
        <span style={{ marginRight: 10 }}>⏱</span>
        {watch.toFixed(1).replace(".", ",")} s{found ? " ✓" : ""}
      </div>
    </>
  );
}

/* 22–32 s: boules → data points → 3D bracket. */
function Bracket() {
  const t = useTime();
  const { vertical } = useLayout();
  const chips: Array<[string, string, boolean]> = [
    ["Tirage automatique", C.blueInk, false],
    ["Terrains attribués", C.accentInk, false],
    ["En direct", C.live, true],
  ];
  return (
    <>
      <BracketScene t={t} vertical={vertical} />
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: vertical ? "column" : "row",
          alignItems: "flex-start",
          ...(vertical ? { left: 48, top: 96 } : { left: 64, bottom: 52 }),
        }}
      >
        {chips.map(([label, color, live], i) => {
          const k = ramp(t, 0.6 + i * 0.5, 1.2 + i * 0.5);
          return (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                ...TITLE,
                fontSize: vertical ? 44 : 40,
                padding: vertical ? "6px 24px" : "6px 22px",
                marginRight: vertical ? 0 : 16,
                marginBottom: vertical ? 10 : 0,
                borderRadius: 999,
                color: C.ink,
                background: "rgba(11,22,64,0.78)",
                border: `2px solid ${color}88`,
                boxShadow: `0 0 30px ${color}33`,
                opacity: k,
                transform: `translateY(${(1 - k) * 24}px)`,
                filter: k < 1 ? `blur(${(1 - k) * 8}px)` : undefined,
              }}
            >
              {live ? <Dot color={C.live} pulse size={vertical ? 18 : 14} /> : <span style={{ color, marginRight: 12 }}>✓</span>}
              {label}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* 32–40 s: the scorers' table, « 12 13 7 », notifications to three phones. */
const PREVIOUS: Entry[] = [
  { at: -6, terrain: 3, a: 3, b: 50, sa: 13, sb: 9 },
  { at: -5, terrain: 7, a: 22, b: 57, sa: 11, sb: 13 },
  { at: -4, terrain: 1, a: 38, b: 14, sa: 13, sb: 4 },
];

function TiltedBoard({ t, children, x, y, scale, rotY, glitch = 0 }: { t: number; children: React.ReactNode; x: number; y: number; scale: number; rotY: number; glitch?: number }) {
  const float = Math.sin(t * 1.1) * 5;
  const slices = glitch > 0 ? [0, 1, 2, 3, 4, 5] : [];
  const frame = Math.floor(t * 30);
  return (
    <div style={{ position: "absolute", left: x, top: y + float, width: 760, height: 470, transformOrigin: "0 0", transform: `scale(${scale})` }}>
      <div style={{ position: "absolute", inset: 0, transform: `perspective(1400px) rotateY(${rotY}deg) rotateX(4deg)` }}>
        <Panel width={760} height={470} glow={C.accent} style={{ filter: glitch > 0 ? `hue-rotate(${glitch * 90}deg) saturate(${1 + glitch})` : undefined }}>
          {children}
        </Panel>
        {slices.map((i) => {
          const y0 = rand(frame * 7 + i) * 440;
          const h = 8 + rand(frame * 3 + i) * 40;
          const dx = (rand(frame + i * 13) - 0.5) * 80 * glitch;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: dx,
                top: y0,
                width: 760,
                height: h,
                background: i % 2 ? `rgba(255,77,66,${0.35 * glitch})` : `rgba(47,84,255,${0.4 * glitch})`,
                mixBlendMode: "screen",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function MiniPhone({ t, x, y, scale, at, title, big, sub, color, rot }: { t: number; x: number; y: number; scale: number; at: number; title: string; big: string; sub: string; color: string; rot: number }) {
  const k = ramp(t, at, at + 0.45);
  const shake = t > at && t < at + 0.5 ? Math.sin((t - at) * 70) * 4 : 0;
  return (
    <Phone scale={scale} glow={color} style={{ left: x - 192, top: y - 392 + Math.sin(t * 1.3 + x) * 6, transform: `rotate(${rot + shake * 0.3}deg)` }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 20%, #0f2470, ${C.stage} 70%)` }} />
      <div style={{ position: "absolute", top: 90, left: 0, right: 0, textAlign: "center", ...TITLE, fontSize: 92, ...NUM, color: C.ink }}>15:41</div>
      <div
        style={{
          position: "absolute",
          left: 14,
          right: 14,
          top: 250,
          borderRadius: 30,
          padding: "22px 22px",
          background: `linear-gradient(150deg, ${color}, ${color}cc)`,
          color: C.stage,
          transform: `translateY(${(1 - k) * -200}px) scale(${mix(0.8, 1, k)})`,
          opacity: k,
          boxShadow: `0 20px 60px ${color}88`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 26, fontWeight: 800 }}>
          <Logo size={30} wordmark={false} color={C.stage} accent="#fff" />
          <span style={{ marginLeft: 10 }}>{title}</span>
        </div>
        <div style={{ ...TITLE, fontSize: 74, lineHeight: 1, marginTop: 8, ...NUM }}>{big}</div>
        <div style={{ ...TITLE, fontSize: 40, ...NUM }}>{sub}</div>
      </div>
    </Phone>
  );
}

function ScoreTable() {
  const t = useTime();
  const { vertical } = useLayout();
  const entries: Entry[] = [...PREVIOUS, { at: 2.7, terrain: 12, a: 12, b: 31, sa: 13, sb: 7 }];
  const phones = vertical
    ? [
        { x: 150, y: 960, rot: -6 },
        { x: 360, y: 940, rot: 0 },
        { x: 570, y: 960, rot: 6 },
      ]
    : [
        { x: 905, y: 330, rot: -7 },
        { x: 1040, y: 300, rot: 0 },
        { x: 1175, y: 330, rot: 7 },
      ];
  const notes = [
    { title: "À vous !", big: "Terrain 4", sub: "15 h 55", color: C.accent },
    { title: "Équipe 12", big: "Qualifiée", sub: "Tour 3", color: C.success },
    { title: "Équipe 31", big: "Terrain 18", sub: "Complémentaire", color: C.blueSoft },
  ];
  const src = vertical ? { x: 360, y: 560 } : { x: 600, y: 300 };
  return (
    <>
      <Backdrop accent={C.accent} speed={0.6} />
      <TiltedBoard t={t} x={vertical ? 33 : 40} y={vertical ? 330 : 50} scale={vertical ? 0.86 : 1} rotY={vertical ? 0 : 12}>
        <Board t={t} typing={[{ text: "12 13 7", from: 1.0, until: 2.7 }]} entries={entries} />
      </TiltedBoard>
      {phones.map((p, i) => (
        <React.Fragment key={i}>
          <Beam x1={src.x} y1={src.y} x2={p.x} y2={p.y - 60} k={(t - 3.1 - i * 0.18) / 0.7} color={notes[i].color} />
          <MiniPhone t={t} {...p} scale={vertical ? 0.47 : 0.38} at={3.75 + i * 0.18} {...notes[i]} />
        </React.Fragment>
      ))}
      <Caption words="Un score saisi, tout le monde est prévenu." at={0.4} accent={C.accent} />
    </>
  );
}

/* 40–47 s: the network drops, entries wait, then leave when it comes back. */
function Offline() {
  const t = useTime();
  const { vertical } = useLayout();
  const cut = 0.9;
  const back = 4.3;
  const entries: Entry[] = [
    ...PREVIOUS,
    { at: -1, terrain: 12, a: 12, b: 31, sa: 13, sb: 7 },
    { at: 2.4, terrain: 5, a: 3, b: 50, sa: 13, sb: 11, sentAt: back + 0.3 },
    { at: 3.6, terrain: 18, a: 9, b: 41, sa: 9, sb: 13, sentAt: back + 0.6 },
  ];
  const pending = entries.filter((e) => e.sentAt !== undefined && t >= e.at && t < e.sentAt).length;
  const state = t < cut ? "live" : t < back ? "offline" : pending > 0 ? "offline" : "synced";
  const glitch = Math.max(clamp01(1 - Math.abs(t - (cut + 0.15)) / 0.3), clamp01(1 - Math.abs(t - back) / 0.2) * 0.6);
  const signal = t < cut || t >= back;
  const sig = vertical ? { x: 360, y: 930, s: 1 } : { x: 1060, y: 300, s: 1 };
  return (
    <>
      <Backdrop accent={signal ? C.blueSoft : C.live} speed={signal ? 0.5 : 0.05} glow={signal ? 1 : 0.4} />
      <TiltedBoard t={t} x={vertical ? 33 : 50} y={vertical ? 330 : 50} scale={vertical ? 0.86 : 1} rotY={vertical ? 0 : -8} glitch={glitch}>
        <Board
          t={t}
          typing={[
            { text: "5 13 11", from: 1.5, until: 2.4 },
            { text: "18 9 13", from: 2.7, until: 3.6 },
          ]}
          entries={entries}
          state={state}
          pending={pending}
        />
      </TiltedBoard>
      <SignalIcon x={sig.x} y={sig.y} on={signal} t={t} glitch={glitch} />
      <Caption words="Même sans réseau." at={0.5} accent={signal ? C.success : C.live} />
    </>
  );
}

function SignalIcon({ x, y, on, t, glitch }: { x: number; y: number; on: boolean; t: number; glitch: number }) {
  const color = on ? C.success : C.live;
  return (
    <div style={{ position: "absolute", left: x - 140, top: y - 120, width: 280, height: 240, transform: `translateX(${(rand(Math.floor(t * 30)) - 0.5) * 30 * glitch}px)` }}>
      <svg width={280} height={240} viewBox="0 0 280 240">
        {[100, 70, 40].map((r, i) => (
          <path
            key={r}
            d={`M ${140 - r} ${170 - r * 0.15} A ${r * 1.05} ${r * 1.05} 0 0 1 ${140 + r} ${170 - r * 0.15}`}
            fill="none"
            stroke={color}
            strokeWidth={16}
            strokeLinecap="round"
            opacity={on ? 1 : 0.45 + 0.2 * Math.sin(t * 12 + i)}
            style={{ filter: `drop-shadow(0 0 12px ${color})` }}
          />
        ))}
        <circle cx={140} cy={182} r={14} fill={color} style={{ filter: `drop-shadow(0 0 12px ${color})` }} />
        {!on ? <line x1={60} y1={40} x2={220} y2={210} stroke={C.live} strokeWidth={14} strokeLinecap="round" /> : null}
      </svg>
      <div style={{ textAlign: "center", ...TITLE, fontSize: 30, color }}>{on ? "Connecté" : "Pas de réseau"}</div>
    </div>
  );
}

/* 47–55 s: the pétanque ball becomes a football. */
function Morph() {
  const t = useTime();
  const { vertical } = useLayout();
  const m = ramp(t, 1.6, 4.4, "inOut");
  return (
    <>
      <MorphScene t={t} vertical={vertical} />
      <Caption
        words={[
          { text: "Pétanque,", color: C.accentInk },
          { text: "football…", color: C.cyanInk },
          "et",
          "demain",
          "votre",
          "sport.",
        ]}
        at={0.5}
        stagger={0.28}
        accent={mixColor(C.accent, C.cyan, m)}
      />
    </>
  );
}

/* 55–65 s: the club builds its tournament, pays, and gets link, QR code and poster. */
const FORM: Array<[string, string, string]> = [
  ["Sport", "Pétanque", C.accent],
  ["Format", "Doublettes · élimination", C.accentInk],
  ["Date", "samedi 14 juin · 14 h", C.blueInk],
  ["Terrains", "32 au 1er tour", C.blueInk],
  ["Inscriptions", "64 équipes · 10 €", C.success],
];

function ClubCreate() {
  const t = useTime();
  const { vertical } = useLayout();
  const tap = 4.5;
  const paid = ramp(t, tap + 0.2, tap + 0.5);
  const slot = ramp(t, tap + 0.6, tap + 1.0);
  const L = vertical
    ? { cards: { x: 60, y: 330, w: 600 }, step: 76, btn: { x: 60, y: 735, w: 600 }, slotY: 1150, slotX: 40, slotW: 640 }
    : { cards: { x: 80, y: 60, w: 470 }, step: 76, btn: { x: 80, y: 456, w: 470 }, slotY: 520, slotX: 640, slotW: 580 };
  const outs = vertical
    ? [
        { x: 60, w: 300, h: 120, at: 5.6 },
        { x: 380, w: 130, h: 150, at: 6.0 },
        { x: 530, w: 150, h: 212, at: 6.4 },
      ]
    : [
        { x: 660, w: 270, h: 120, at: 5.6 },
        { x: 950, w: 120, h: 150, at: 6.0 },
        { x: 1085, w: 140, h: 198, at: 6.4 },
      ];
  return (
    <>
      <Backdrop accent={C.blueSoft} speed={0.5} />
      <div style={{ position: "absolute", inset: 0, perspective: 1200 }}>
        {FORM.map(([label, value, color], i) => {
          const at = 0.3 + i * 0.45;
          const k = ramp(t, at, at + 0.9);
          return (
            <div
              key={label}
              style={{
                position: "absolute",
                left: L.cards.x,
                top: L.cards.y + i * L.step,
                width: L.cards.w,
                height: 64,
                borderRadius: 18,
                background: "rgba(15,23,54,0.92)",
                border: `1.5px solid ${color}66`,
                boxShadow: `0 16px 40px rgba(0,0,0,0.4), 0 0 24px ${color}22`,
                display: "flex",
                alignItems: "center",
                padding: "0 20px",
                fontFamily: "Saira",
                color: C.ink,
                opacity: k,
                transform: `translateZ(${(1 - k) * -900}px) rotateX(${(1 - k) * 60}deg) rotateY(${(1 - k) * (i % 2 ? 40 : -40) + (vertical ? 0 : 8)}deg)`,
              }}
            >
              <span style={{ width: 10, height: 34, borderRadius: 5, background: color, marginRight: 16, boxShadow: `0 0 14px ${color}` }} />
              <span style={{ fontSize: vertical ? 22 : 18, color: C.inkSoft, fontWeight: 600, width: vertical ? 150 : 120 }}>{label}</span>
              <span style={{ fontSize: vertical ? 27 : 23, fontWeight: 800 }}>{value}</span>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: L.btn.x, top: L.btn.y, width: L.btn.w, opacity: ramp(t, 3.0, 3.4) }}>
        <Button label={paid > 0.5 ? "✓ Payé · publié" : "Payer et publier"} color={paid > 0.5 ? C.success : C.accent} big pressed={clamp01(1 - Math.abs(t - tap) / 0.2)} />
      </div>
      <Pointer path={[[3.6, L.btn.x + L.btn.w * 0.75, L.btn.y + 140], [4.4, L.btn.x + L.btn.w / 2, L.btn.y + 34], [5.1, L.btn.x + L.btn.w * 0.7, L.btn.y + 120]]} taps={[tap]} />
      {/* Light slot (the « printer ») */}
      <div
        style={{
          position: "absolute",
          left: L.slotX,
          top: L.slotY - 3,
          width: L.slotW,
          height: 6,
          borderRadius: 3,
          background: "#fff",
          opacity: slot,
          boxShadow: `0 0 20px 6px ${C.blueSoft}, 0 0 60px 16px ${C.blueSoft}66`,
          transform: `scaleX(${slot})`,
        }}
      />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: L.slotY, overflow: "hidden" }}>
        {outs.map((o, i) => {
          const k = ramp(t, o.at, o.at + 1.1, "out");
          return (
            <div key={i} style={{ position: "absolute", left: o.x, top: L.slotY - o.h * k - 8 * k, width: o.w, height: o.h }}>
              {i === 0 ? (
                <Card accent={C.accent} style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", boxShadow: `0 0 40px ${C.accent}44` }}>
                  <div style={{ fontFamily: "Saira", fontSize: 18, color: C.inkSoft }}>Votre lien</div>
                  <div style={{ ...TITLE, fontSize: vertical ? 34 : 32, color: C.accentInk }}>/c/7KQ2</div>
                  <div style={{ fontFamily: "Saira", fontSize: 16, color: C.ink }}>orgasport.fr/c/7KQ2</div>
                </Card>
              ) : i === 1 ? (
                <div style={{ height: "100%", borderRadius: 16, background: "#fff", padding: 10, display: "flex", flexDirection: "column", alignItems: "center", boxShadow: `0 0 40px ${C.blueSoft}55` }}>
                  <QR size={o.w - 20} seed={11} />
                  <div style={{ ...TITLE, fontSize: 18, color: C.cobalt, marginTop: 4 }}>QR code</div>
                </div>
              ) : (
                <Poster w={o.w} h={o.h} />
              )}
            </div>
          );
        })}
      </div>
      <Caption words="Créez votre concours en 3 minutes." at={0.4} place={vertical ? "top" : "bottom"} accent={C.blueSoft} />
    </>
  );
}

/** Mini A4 poster (same layout as the printable poster of the site). */
function Poster({ w, h }: { w: number; h: number }) {
  const s = w / 140;
  return (
    <div style={{ width: w, height: h, background: "#f4f6fb", borderRadius: 4 * s, padding: 10 * s, boxShadow: `0 0 50px ${C.accent}55`, fontFamily: "Saira", color: C.cobalt, overflow: "hidden" }}>
      <div style={{ height: 8 * s, background: C.accent, borderRadius: 2, marginBottom: 6 * s }} />
      <div style={{ ...TITLE, fontSize: 17 * s, lineHeight: 1 }}>GRAND PRIX D'AUTOMNE</div>
      <div style={{ fontSize: 9 * s, fontWeight: 700, margin: `${4 * s}px 0` }}>Samedi 14 juin · 14 h · doublettes</div>
      <QR size={70 * s} seed={11} style={{ display: "block", margin: `${6 * s}px auto` }} />
      <div style={{ ...TITLE, fontSize: 11 * s, textAlign: "center" }}>orgasport.fr/c/7KQ2</div>
    </div>
  );
}

/* 65–75 s: zoom out to a map of France, logo. */
function Finale() {
  const t = useTime();
  const { vertical } = useLayout();
  const k = ramp(t, 4.6, 5.4);
  return (
    <>
      <FranceScene t={t} vertical={vertical} />
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: "column",
          ...(vertical ? { left: 0, right: 0, top: 120, alignItems: "center", textAlign: "center" } : { left: 80, top: 0, bottom: 0, justifyContent: "center", width: 560 }),
        }}
      >
        <div style={{ opacity: k, transform: `scale(${mix(0.85, 1, k)})`, filter: k < 1 ? `blur(${(1 - k) * 10}px)` : undefined, transformOrigin: vertical ? "50% 50%" : "0 50%" }}>
          <Logo size={vertical ? 76 : 72} />
        </div>
        <Kinetic
          words="Vos concours, de l'inscription aux résultats."
          at={5.3}
          size={vertical ? 50 : 44}
          align={vertical ? "center" : "left"}
          style={{ marginTop: 18, maxWidth: vertical ? 600 : 520, textShadow: "0 4px 30px rgba(4,6,12,0.9)" }}
        />
        <div style={{ marginTop: 26, opacity: ramp(t, 6.3, 6.8), transform: `translateY(${(1 - ramp(t, 6.3, 6.8)) * 16}px)` }}>
          <span style={{ ...TITLE, fontSize: vertical ? 36 : 30, padding: "10px 26px", borderRadius: 999, background: C.blue, color: "#fff", boxShadow: `0 0 40px ${C.blue}aa` }}>
            orgasport.fr
          </span>
        </div>
      </div>
      <AbsoluteFill style={{ background: C.stage, opacity: ramp(t, 9.2, 10) }} />
    </>
  );
}
