import { describe, expect, it } from "vitest";
import { commandRequestSchema, commandSchema } from "./command-schema";

describe("command schema: final close of the link", () => {
  it("accepts tournament.close sent by the scoring table", () => {
    expect(commandSchema.safeParse({ type: "tournament.close" }).success).toBe(true);
    const req = commandRequestSchema.safeParse({
      clientOpId: "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7",
      command: { type: "tournament.close" },
    });
    expect(req.success).toBe(true);
  });

  it("refuses setStatus to archived: only tournament.close archives", () => {
    expect(commandSchema.safeParse({ type: "tournament.setStatus", status: "archived" }).success).toBe(false);
    expect(commandSchema.safeParse({ type: "tournament.setStatus", status: "finished" }).success).toBe(true);
  });

  it("accepts tournament.resume (two-day tournament), with or without a seed", () => {
    expect(commandSchema.safeParse({ type: "tournament.resume" }).success).toBe(true);
    expect(commandSchema.safeParse({ type: "tournament.resume", seed: "day2" }).success).toBe(true);
    expect(commandSchema.safeParse({ type: "tournament.resume", seed: "" }).success).toBe(false);
  });

  it("refuses an unknown command type", () => {
    expect(commandSchema.safeParse({ type: "tournament.reopen" }).success).toBe(false);
  });
});
