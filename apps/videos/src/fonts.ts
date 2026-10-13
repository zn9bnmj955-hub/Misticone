import { continueRender, delayRender, staticFile } from "remotion";

/**
 * Saira (the site's font, OFL — public/fonts/SAIRA-OFL.txt), loaded before the
 * first frame is captured.
 */
if (typeof document !== "undefined") {
  const handle = delayRender("Saira");
  const faces = [
    new FontFace("Saira", `url(${staticFile("fonts/saira-latin-wdth-normal.woff2")}) format("woff2")`, {
      weight: "100 900",
      stretch: "50% 125%",
      style: "normal",
    }),
    new FontFace("Saira", `url(${staticFile("fonts/saira-latin-wdth-italic.woff2")}) format("woff2")`, {
      weight: "100 900",
      stretch: "50% 125%",
      style: "italic",
    }),
  ];
  Promise.all(faces.map((f) => f.load()))
    .then((loaded) => loaded.forEach((f) => (document.fonts as unknown as Set<FontFace>).add(f)))
    .catch((err) => console.error("Saira", err))
    .finally(() => continueRender(handle));
}
