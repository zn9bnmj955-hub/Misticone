import React from "react";
import { Composition } from "remotion";
import "./fonts";
import { Decouverte } from "./scenes/Decouverte";
import { Tutoriel } from "./scenes/Tutoriel";
import { FPS, script } from "./theme";

const H = { width: 1280, height: 720 };
const V = { width: 720, height: 1280 };

export function Root() {
  const d = script.decouverte.duration * FPS;
  const t = script.tutoriel.duration * FPS;
  return (
    <>
      <Composition id="Decouverte169" component={Decouverte} durationInFrames={d} fps={FPS} {...H} />
      <Composition id="Decouverte916" component={Decouverte} durationInFrames={d} fps={FPS} {...V} />
      <Composition id="Tutoriel169" component={Tutoriel} durationInFrames={t} fps={FPS} {...H} />
      <Composition id="Tutoriel916" component={Tutoriel} durationInFrames={t} fps={FPS} {...V} />
    </>
  );
}
