import { describe, expect, it } from "vitest";
import { selectProvider, simulationAllowed } from "./provider";

describe("selectProvider", () => {
  it("uses Stripe as soon as a secret key is set", () => {
    expect(selectProvider({ NODE_ENV: "production", STRIPE_SECRET_KEY: "sk_test_x" })).toBe("stripe");
    expect(selectProvider({ NODE_ENV: "development", STRIPE_SECRET_KEY: "sk_test_x" })).toBe("stripe");
  });

  it("simulates payments in development without a key", () => {
    expect(selectProvider({ NODE_ENV: "development" })).toBe("simulation");
    expect(selectProvider({ NODE_ENV: "test", STRIPE_SECRET_KEY: "  " })).toBe("simulation");
  });

  it("never simulates in production", () => {
    expect(selectProvider({ NODE_ENV: "production" })).toBeNull();
    expect(selectProvider({ NODE_ENV: "production", PAYMENTS_SIMULATION: "1" })).toBeNull();
    expect(selectProvider({ NODE_ENV: "production", STRIPE_SECRET_KEY: "sk_live_x", PAYMENTS_SIMULATION: "1" })).toBe("stripe");
    expect(simulationAllowed({ NODE_ENV: "production" })).toBe(false);
  });

  it("PAYMENTS_SIMULATION forces or disables the simulation outside production", () => {
    expect(selectProvider({ NODE_ENV: "development", STRIPE_SECRET_KEY: "sk_test_x", PAYMENTS_SIMULATION: "1" })).toBe("simulation");
    expect(selectProvider({ NODE_ENV: "development", PAYMENTS_SIMULATION: "0" })).toBeNull();
  });
});
