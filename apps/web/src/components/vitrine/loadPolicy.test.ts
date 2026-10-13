import { describe, expect, it } from "vitest";
import { canRun3D } from "./loadPolicy";
import { HEXAGON_CENTERS, ICO_EDGES, PENTAGON_CENTERS } from "./ballGeometry";

const capable = { reducedMotion: false, webgl2: true, cores: 8, memory: 8, saveData: false };

describe("canRun3D", () => {
  it("allows a capable device", () => {
    expect(canRun3D(capable)).toBe(true);
    expect(canRun3D({ ...capable, memory: undefined })).toBe(true);
  });
  it("refuses reduced motion, no WebGL2, save-data and weak devices", () => {
    expect(canRun3D({ ...capable, reducedMotion: true })).toBe(false);
    expect(canRun3D({ ...capable, webgl2: false })).toBe(false);
    expect(canRun3D({ ...capable, saveData: true })).toBe(false);
    expect(canRun3D({ ...capable, cores: 2 })).toBe(false);
    expect(canRun3D({ ...capable, cores: undefined })).toBe(false);
    expect(canRun3D({ ...capable, memory: 2 })).toBe(false);
  });
});

describe("football geometry", () => {
  it("has 12 pentagons, 20 hexagons and 30 icosahedron edges", () => {
    expect(PENTAGON_CENTERS).toHaveLength(12);
    expect(HEXAGON_CENTERS).toHaveLength(20);
    expect(ICO_EDGES).toHaveLength(30);
  });
});
