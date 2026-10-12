import { execSync } from "node:child_process";
import path from "node:path";

/** Fresh demo data before the end-to-end run (local Supabase). */
export default function globalSetup() {
  if (process.env.E2E_SKIP_RESET) return;
  execSync("npx supabase db reset", {
    cwd: path.resolve(__dirname, "../../.."),
    stdio: "ignore",
    env: { ...process.env, SUPABASE_INTERNAL_IMAGE_REGISTRY: process.env.SUPABASE_INTERNAL_IMAGE_REGISTRY ?? "docker.io" },
  });
}
