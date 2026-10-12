import { randomInt } from "node:crypto";

export const PIN_LENGTH = 6;

/** PINs a volunteer could guess first ("000000", "123456", "987654"…). */
export function isWeakPin(pin: string): boolean {
  const digits = pin.split("").map(Number);
  const steps = new Set(digits.slice(1).map((d, i) => d - digits[i]!));
  return steps.size === 1 && [0, 1, -1].includes([...steps][0]!);
}

/**
 * Volunteer PINs for the scoring table: `count` distinct 6-digit codes from
 * a cryptographic random source (no modulo bias), skipping obvious ones.
 * They are hashed by the database and only ever shown in the organizer's
 * confirmation email.
 */
export function generatePins(count: number, nextInt: (max: number) => number = (max) => randomInt(0, max)): string[] {
  const max = 10 ** PIN_LENGTH;
  const pins = new Set<string>();
  for (let attempts = 0; pins.size < count; attempts++) {
    if (attempts > count * 100 + 100) throw new Error("generatePins: random source is not random");
    const pin = String(nextInt(max)).padStart(PIN_LENGTH, "0");
    if (!isWeakPin(pin)) pins.add(pin);
  }
  return [...pins];
}
