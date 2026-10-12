/**
 * Short tournament codes, e.g. "7KQ2". Ambiguous characters (0/O, 1/I/L) are
 * excluded so a code can be read aloud or typed from a poster without errors.
 */
export const SHORT_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const SHORT_CODE_LENGTH = 4;

export function generateShortCode(
  random: () => number = Math.random,
  length = SHORT_CODE_LENGTH,
): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += SHORT_CODE_ALPHABET[Math.floor(random() * SHORT_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Normalizes what a person typed or scanned: accepts "7kq2", "7KQ-2" or a full
 * link such as "https://orgasport.fr/c/7KQ2".
 */
export function normalizeShortCode(input: string): string {
  const fromLink = input.match(/\/c\/([A-Za-z0-9]+)/);
  const raw = fromLink?.[1] ?? input;
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

export function isShortCode(input: string): boolean {
  return new RegExp(`^[${SHORT_CODE_ALPHABET}]{4,6}$`).test(input);
}
