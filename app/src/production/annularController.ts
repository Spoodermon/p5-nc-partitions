import { routeAnnularPermutation, type RoutedAnnularDiagram } from "../geometry/annular-routing";
import {
  analyzeAnnularNoncrossing,
  annularPermutationToString,
  parseAnnularPermutation,
  type AnnularError,
  type AnnularPermutation,
} from "../math";

export type AnnularInputErrorKind = "syntax-domain" | "mathematically-crossing" | "router-failure";

export interface AnnularInputError {
  readonly kind: AnnularInputErrorKind;
  readonly message: string;
}

export interface AcceptedAnnularInput {
  readonly ok: true;
  readonly permutation: AnnularPermutation;
  readonly routed: Extract<RoutedAnnularDiagram, { readonly isRoutable: true }>;
  readonly canonicalNotation: string;
}

export interface RejectedAnnularInput {
  readonly ok: false;
  readonly error: AnnularInputError;
}

export type AnnularInputResult = AcceptedAnnularInput | RejectedAnnularInput;
export type AnnularRouter = (value: AnnularPermutation) => RoutedAnnularDiagram;

function boundaryValue(text: string, name: "p" | "q"): number | AnnularInputError {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "syntax-domain", message: `${name} is required and must be a positive integer.` };
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1) {
    return { kind: "syntax-domain", message: `${name} must be a positive integer.` };
  }
  return value;
}

export function annularParseErrorMessage(error: AnnularError, p: number, q: number): string {
  switch (error.kind) {
    case "out-of-range-label": return `Label ${error.label} exceeds p+q=${p + q}.`;
    case "duplicate-label": return `Label ${error.label} occurs in more than one cycle.`;
    case "non-positive-label": return `Labels must be positive; found ${error.label}.`;
    case "non-integer-label": return `Expected an integer label near position ${error.position + 1}.`;
    case "malformed-syntax": return `${error.message} (position ${error.position + 1}).`;
    case "invalid-boundary-size": return "p and q must be positive integers.";
    case "support-size-mismatch": return `Permutation support has size ${error.actual}; expected ${error.expected}.`;
    case "invalid-permutation": return error.message;
  }
}

export function processAnnularInput(
  pText: string,
  qText: string,
  notation: string,
  router: AnnularRouter = routeAnnularPermutation,
): AnnularInputResult {
  const p = boundaryValue(pText, "p");
  if (typeof p !== "number") return { ok: false, error: p };
  const q = boundaryValue(qText, "q");
  if (typeof q !== "number") return { ok: false, error: q };

  const parsed = parseAnnularPermutation(notation, p, q);
  if (!parsed.ok) {
    return { ok: false, error: { kind: "syntax-domain", message: annularParseErrorMessage(parsed.error, p, q) } };
  }

  const analysis = analyzeAnnularNoncrossing(parsed.value);
  if (!analysis.isNoncrossing) {
    return {
      ok: false,
      error: {
        kind: "mathematically-crossing",
        message: `Permutation is not annular-noncrossing for (p,q)=(${p},${q}).`,
      },
    };
  }

  const routed = router(parsed.value);
  if (!routed.isRoutable) {
    return {
      ok: false,
      error: {
        kind: "router-failure",
        message: "The permutation is mathematically annular-noncrossing, but the current bounded router could not produce an admitted route.",
      },
    };
  }

  return {
    ok: true,
    permutation: parsed.value,
    routed,
    canonicalNotation: annularPermutationToString(parsed.value),
  };
}
