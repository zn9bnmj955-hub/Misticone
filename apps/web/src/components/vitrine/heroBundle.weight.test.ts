import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

/**
 * V2 acceptance: the 3D landing module (loaded on demand, three.js excluded) must not
 * grow past its size before the engraved boule (8 362 bytes gzip, ball + football version).
 * esbuild is reached through vitest -> vite, so no new dependency is needed.
 */
const BEFORE_V2_GZIP_BYTES = 8362;

type OutputFile = { path: string; contents: Uint8Array };
type Esbuild = { build(options: Record<string, unknown>): Promise<{ outputFiles: OutputFile[] }> };

function loadEsbuild(): Esbuild {
  const fromVitest = createRequire(createRequire(import.meta.url).resolve("vitest/package.json"));
  const fromVite = createRequire(fromVitest.resolve("vite/package.json"));
  return fromVite("esbuild");
}

describe("landing 3D module weight", () => {
  it("stays at or below its size before the engraved boule (three.js excluded)", async () => {
    const result = await loadEsbuild().build({
      entryPoints: [fileURLToPath(new URL("./heroScene3d.ts", import.meta.url))],
      bundle: true,
      minify: true,
      format: "esm",
      write: false,
      external: ["three", "three/*"],
      logLevel: "silent",
    });
    const files = result.outputFiles.map((f: OutputFile) => f.path);
    expect(files).toHaveLength(1);
    const bytes = gzipSync(result.outputFiles[0].contents, { level: 9 }).length;
    expect(bytes).toBeGreaterThan(1000);
    expect(bytes).toBeLessThanOrEqual(BEFORE_V2_GZIP_BYTES);
  });
});
