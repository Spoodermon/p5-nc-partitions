/** Production support limits. Validate before any input-sized allocation. */
export const INPUT_LIMITS = Object.freeze({
  discSupport: 400,
  annularP: 20,
  annularQ: 20,
  annularTotalSupport: 24,
  maximumLabel: 400,
  inputCharacters: 16_384,
  maxOrientationCandidates: 50_000,
});

export type BoundedPositiveIntegerError = "required" | "invalid-integer" | "unsafe-integer" | "too-large";

/** Parse a decimal positive integer without first converting an unbounded token. */
export function parseBoundedPositiveInteger(
  text: string,
  maximum: number,
): { readonly ok: true; readonly value: number } | { readonly ok: false; readonly reason: BoundedPositiveIntegerError } {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, reason: "required" };
  if (!/^[+]?[0-9]+$/.test(trimmed)) return { ok: false, reason: "invalid-integer" };
  const digits = trimmed[0] === "+" ? trimmed.slice(1) : trimmed;
  const normalized = digits.replace(/^0+(?=\d)/, "");
  const maximumText = String(maximum);
  if (normalized.length > 15) return { ok: false, reason: "unsafe-integer" };
  if (normalized.length > maximumText.length || (normalized.length === maximumText.length && normalized > maximumText)) {
    return { ok: false, reason: "too-large" };
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value)) return { ok: false, reason: "unsafe-integer" };
  if (value < 1) return { ok: false, reason: "invalid-integer" };
  return { ok: true, value };
}
