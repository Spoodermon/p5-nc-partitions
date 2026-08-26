import { routeAnnularPermutation, type RoutedAnnularDiagram } from "../geometry/annular-routing";
import {
  analyzeAnnularNoncrossing,
  annularPermutationFromImages,
  annularPermutationToString,
  parseAnnularPermutation,
  permutationCycles,
  type AnnularError,
  type AnnularPermutation,
} from "../math";

export type AnnularInputErrorKind = "syntax-domain" | "mathematically-crossing" | "router-failure";
export type AnnularInputInterpretation = "strict-permutation" | "canonical-blocks";

export interface AnnularInputError {
  readonly kind: AnnularInputErrorKind;
  readonly message: string;
}

export interface AcceptedAnnularInput {
  readonly ok: true;
  readonly permutation: AnnularPermutation;
  readonly routed: Extract<RoutedAnnularDiagram, { readonly isRoutable: true }>;
  readonly interpretation: AnnularInputInterpretation;
  readonly sourceNotation: string;
  readonly resolvedNotation: string;
  readonly wasAutoOriented: boolean;
  /** @deprecated Use resolvedNotation. Retained for stored production state compatibility. */
  readonly canonicalNotation: string;
}

export interface RejectedAnnularInput {
  readonly ok: false;
  readonly error: AnnularInputError;
}

export type AnnularInputResult = AcceptedAnnularInput | RejectedAnnularInput;
export type AnnularRouter = (value: AnnularPermutation) => RoutedAnnularDiagram;

export function annularResolutionMessage(value: AcceptedAnnularInput, prefix = "τ"): string {
  if (value.interpretation !== "canonical-blocks") return `${prefix} = ${value.resolvedNotation}`;
  return value.wasAutoOriented
    ? `Auto-oriented block supports to ${prefix} = ${value.resolvedNotation}`
    : `Block supports resolved to ${prefix} = ${value.resolvedNotation}`;
}

const MAX_CANONICAL_ORIENTATIONS = 50_000;

function permutations(values: readonly number[]): readonly (readonly number[])[] {
  if (values.length < 2) return [Object.freeze([...values])];
  const result: number[][] = [];
  values.forEach((value, index) => {
    for (const tail of permutations([...values.slice(0, index), ...values.slice(index + 1)])) {
      result.push([value, ...tail]);
    }
  });
  return result;
}

function orientedCycles(block: readonly number[]): readonly (readonly number[])[] {
  if (block.length < 3) return [Object.freeze([...block])];
  const ordered = [...block].sort((a, b) => a - b);
  const first = ordered[0] as number;
  return permutations(ordered.slice(1)).map((tail) => Object.freeze([first, ...tail]));
}

function fromCycles(p: number, q: number, cycles: readonly (readonly number[])[]): AnnularPermutation {
  const images = Array.from({ length: p + q }, (_, index) => index + 1);
  for (const cycle of cycles) cycle.forEach((label, index) => { images[label - 1] = cycle[(index + 1) % cycle.length] as number; });
  const result = annularPermutationFromImages(p, q, images);
  if (!result.ok) throw new Error(`Canonical annular permutation invariant failed: ${result.error.kind}`);
  return result.value;
}

/**
 * Treats entered cycles as blocks and chooses a stable annular-noncrossing
 * cyclic order. Annular blocks do not have a unique orientation in general,
 * so ties use the lexicographically smallest normalized cycle notation.
 */
export function canonicalizeAnnularBlocks(value: AnnularPermutation): AnnularPermutation | null {
  const choices = permutationCycles(value.permutation).map(orientedCycles);
  let combinations = 1;
  for (const variants of choices) {
    combinations *= variants.length;
    if (combinations > MAX_CANONICAL_ORIENTATIONS) {
      return analyzeAnnularNoncrossing(value).isNoncrossing ? value : null;
    }
  }
  let best: AnnularPermutation | null = null;
  let bestNotation = "";
  const selected: (readonly number[])[] = [];
  const visit = (index: number): void => {
    if (index === choices.length) {
      const candidate = fromCycles(value.p, value.q, selected);
      if (!analyzeAnnularNoncrossing(candidate).isNoncrossing) return;
      const notation = annularPermutationToString(candidate);
      if (!best || notation.localeCompare(bestNotation, "en", { numeric: true }) < 0) { best = candidate; bestNotation = notation; }
      return;
    }
    for (const cycle of choices[index] ?? []) { selected.push(cycle); visit(index + 1); selected.pop(); }
  };
  visit(0);
  return best;
}

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
  interpretation: AnnularInputInterpretation = "strict-permutation",
): AnnularInputResult {
  const p = boundaryValue(pText, "p");
  if (typeof p !== "number") return { ok: false, error: p };
  const q = boundaryValue(qText, "q");
  if (typeof q !== "number") return { ok: false, error: q };

  const parsed = parseAnnularPermutation(notation, p, q);
  if (!parsed.ok) {
    return { ok: false, error: { kind: "syntax-domain", message: annularParseErrorMessage(parsed.error, p, q) } };
  }

  const sourceNotation = annularPermutationToString(parsed.value);
  const resolved = interpretation === "canonical-blocks" ? canonicalizeAnnularBlocks(parsed.value) : parsed.value;
  if (!resolved || !analyzeAnnularNoncrossing(resolved).isNoncrossing) {
    return {
      ok: false,
      error: {
        kind: "mathematically-crossing",
        message: interpretation === "canonical-blocks"
          ? `Block supports cannot be auto-oriented as an annular-noncrossing permutation for (p,q)=(${p},${q}).`
          : `Permutation is not annular-noncrossing for (p,q)=(${p},${q}).`,
      },
    };
  }

  let routed: RoutedAnnularDiagram;
  try {
    routed = router(resolved);
  } catch {
    return {
      ok: false,
      error: {
        kind: "router-failure",
        message: "The permutation is mathematically annular-noncrossing, but the router encountered an unexpected failure.",
      },
    };
  }
  if (!routed.isRoutable) {
    return {
      ok: false,
      error: {
        kind: "router-failure",
        message: routed.reason === "search-limit-exceeded"
          ? "The permutation is mathematically annular-noncrossing, but the production routing search budget was exhausted."
          : "The permutation is mathematically annular-noncrossing, but the current bounded router could not produce an admitted route.",
      },
    };
  }

  return {
    ok: true,
    permutation: resolved,
    routed,
    interpretation,
    sourceNotation,
    resolvedNotation: annularPermutationToString(resolved),
    wasAutoOriented: sourceNotation !== annularPermutationToString(resolved),
    canonicalNotation: annularPermutationToString(resolved),
  };
}
