import "./landing.css";

/**
 * Class names of landing.css (plain CSS with an `ld-` prefix: the Turbopack
 * rule for `*.css` in next.config.ts turns CSS modules into global CSS).
 */
const styles = {
  ballBox: "ld-ballBox",
  canvasHost: "ld-canvasHost",
  chip: "ld-chip",
  door: "ld-door",
  doorArrow: "ld-doorArrow",
  float: "ld-float",
  glow: "ld-glow",
  highlight: "ld-highlight",
  rise: "ld-rise",
  stage: "ld-stage",
  staticBall: "ld-staticBall",
} as const;

export default styles;
