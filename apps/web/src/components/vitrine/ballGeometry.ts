/**
 * Shared data of the landing ball (finish, engraving, pose), used by the 3D
 * ball and by the script that pre-renders its still image.
 *
 * Pure data and math: no DOM, no three.js (this file ships with the page).
 */

export type Vec3 = [number, number, number];

/** Sport data the hero needs (computed on the server from @orgasport/sports). */
export type StageSport = { slug: string; name: string; icon: string; accentToken: string };

/**
 * Finish of the pétanque ball (docs/references/boule-reference.png): smooth,
 * no grooves, very dark silver steel with soft environment reflections.
 */
export const BALL_FINISH = { color: "#2b2d31", metalness: 1, roughness: 0.28 } as const;

/** The single engraving of the ball (no other mark, no number). */
export const ENGRAVING_TEXT = "ORGASPORT";

/**
 * Stroke font of the engraving: wide capitals with small slab serifs, in the
 * style of the reference. Drawn on a canvas, so no external font is needed.
 * Units: cap height = 1, y downwards. Commands: M/L (move/line), C (cubic),
 * E (ellipse arc: cx, cy, rx, ry, start, end, anticlockwise 0|1).
 */
export type GlyphCommand =
  | ["M", number, number]
  | ["L", number, number]
  | ["C", number, number, number, number, number, number]
  | ["E", number, number, number, number, number, number, number];
export type Glyph = { width: number; strokes: GlyphCommand[][] };

const SERIF = 0.13;
const foot = (x: number, y = 1): GlyphCommand[] => [["M", x - SERIF, y], ["L", x + SERIF, y]];

export const GLYPHS: Readonly<Record<string, Glyph>> = {
  O: { width: 1.14, strokes: [[["E", 0.57, 0.5, 0.57, 0.5, 0, Math.PI * 2, 0]]] },
  R: {
    width: 0.98,
    strokes: [
      [["M", 0, 0], ["L", 0, 1]],
      [["M", -SERIF, 0], ["L", 0.5, 0], ["C", 0.93, 0, 0.93, 0.52, 0.5, 0.52], ["L", 0, 0.52]],
      [["M", 0.42, 0.52], ["L", 0.9, 1]],
      foot(0),
      foot(0.92),
    ],
  },
  G: {
    width: 1.1,
    strokes: [
      // Arc open on the right: it stops high at the top, and low enough to meet the stem.
      [["E", 0.57, 0.5, 0.57, 0.5, -0.88, 0.62, 1]],
      // A clear bar going in towards the centre, and a stem down to the end of the arc.
      [["M", 0.55, 0.55], ["L", 1.1, 0.55]],
      [["M", 0.99, 0.55], ["L", 0.99, 0.8]],
    ],
  },
  A: {
    width: 1.16,
    strokes: [
      [["M", 0, 1], ["L", 0.58, 0], ["L", 1.16, 1]],
      [["M", 0.27, 0.66], ["L", 0.89, 0.66]],
      foot(0),
      foot(1.16),
    ],
  },
  S: {
    width: 0.94,
    strokes: [
      [
        ["M", 0.88, 0.16],
        ["C", 0.72, -0.04, 0.06, -0.06, 0.06, 0.26],
        ["C", 0.06, 0.52, 0.88, 0.44, 0.88, 0.74],
        ["C", 0.88, 1.06, 0.18, 1.06, 0.04, 0.82],
      ],
    ],
  },
  P: {
    width: 0.92,
    strokes: [
      [["M", 0, 0], ["L", 0, 1]],
      [["M", -SERIF, 0], ["L", 0.5, 0], ["C", 0.93, 0, 0.93, 0.54, 0.5, 0.54], ["L", 0, 0.54]],
      foot(0),
    ],
  },
  T: {
    width: 1.02,
    strokes: [
      [["M", 0, 0.12], ["L", 0, 0], ["L", 1.02, 0], ["L", 1.02, 0.12]],
      [["M", 0.51, 0], ["L", 0.51, 1]],
      foot(0.51),
    ],
  },
};

/** Stroke width and letter spacing of the engraving, in cap heights. */
export const ENGRAVING_STROKE = 0.23;
export const ENGRAVING_SPACING = 0.3;

/** Left edge of each letter and the total width of the engraved word (cap heights). */
export function layoutEngraving(text: string = ENGRAVING_TEXT): { x: number[]; width: number } {
  const x: number[] = [];
  let cursor = 0;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (!glyph) throw new Error(`no glyph for ${ch}`);
    x.push(cursor);
    cursor += glyph.width + ENGRAVING_SPACING;
  }
  return { x, width: Math.max(0, cursor - ENGRAVING_SPACING) };
}

/** Cap height of the engraving on the ball (radians of arc on a radius-1 ball, ≈ 3 mm on a 72 mm boule). */
export const ENGRAVING_CAP = 0.095;
/** Slant of the word on screen at rest (radians, rising to the right like the reference). */
export const ENGRAVING_ANGLE = 0.12;

/** Initial orientation of the ball (radians): x tilt, spin, roll — see poseBall in ballModel.ts. */
export const BALL_TILT: Vec3 = [0.5, -0.65, 0.18];
