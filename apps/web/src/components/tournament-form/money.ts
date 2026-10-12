/** Entry fees typed in euros, the French way ("10", "10,50", "7.5 €"). */

const MAX_CENTS = 100_000;

/** Euros text → cents. Empty means free (0). Null when not a valid amount. */
export function parseEuros(text: string): number | null {
  const clean = text.replace(/[\s  €]/g, "").replace(",", ".");
  if (clean === "") return 0;
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return cents <= MAX_CENTS ? cents : null;
}

/** Cents → value shown in the field: 1000 → "10", 1050 → "10,50". */
export function eurosInput(cents: number): string {
  if (cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2).replace(".", ",");
}
