import { INPUT_LIMITS, parseBoundedPositiveInteger } from "../config/limits";
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

export type AnnularInputErrorKind = "syntax-domain" | "input-limit" | "mathematically-crossing" | "auto-orient-search-exhausted" | "router-failure";
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

export interface AutoOrientSearchResult {
  readonly status: "found" | "no-annular-noncrossing-orientation" | "auto-orient-search-exhausted";
  readonly value: AnnularPermutation | null;
  readonly searchedOrientationCandidates: number;
  readonly maxOrientationCandidates: number;
}

function normalizeCycle(values: readonly number[]): readonly number[] {
  if (values.length < 2) return Object.freeze([...values]);
  const minimum = Math.min(...values);
  const offset = values.indexOf(minimum);
  return Object.freeze([...values.slice(offset), ...values.slice(0, offset)]);
}

function* permutationsLazy(values: readonly number[]): Generator<readonly number[]> {
  if (values.length < 2) { yield Object.freeze([...values]); return; }
  for (let index = 0; index < values.length; index += 1) {
    const head = values[index] as number;
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const tail of permutationsLazy(rest)) yield Object.freeze([head, ...tail]);
  }
}

/** Natural boundary orders first, then a fully lazy deterministic enumeration. */
function* orientedCycles(block: readonly number[]): Generator<readonly number[]> {
  if (block.length < 3) { yield Object.freeze([...block]); return; }
  const ordered = [...block].sort((a, b) => a - b);
  const first = ordered[0] as number;
  const preferred = [normalizeCycle(block), normalizeCycle([...block].reverse()), Object.freeze(ordered), Object.freeze([first, ...ordered.slice(1).reverse()])];
  const seen = new Set<string>();
  for (const cycle of preferred) {
    const key = cycle.join(",");
    if (!seen.has(key)) { seen.add(key); yield cycle; }
  }
  for (const tail of permutationsLazy(ordered.slice(1))) {
    const cycle = Object.freeze([first, ...tail]);
    const key = cycle.join(",");
    if (!seen.has(key)) { seen.add(key); yield cycle; }
  }
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
 * cyclic order. Annular blocks do not have a unique orientation in general;
 * the first admissible candidate in the documented deterministic order wins.
 */
export function resolveCanonicalAnnularBlocks(
  value: AnnularPermutation,
  maxOrientationCandidates: number = INPUT_LIMITS.maxOrientationCandidates,
): AutoOrientSearchResult {
  const blocks = permutationCycles(value.permutation);
  let searched = 0;
  let exhausted = false;
  let found: AnnularPermutation | null = null;
  const selected: (readonly number[])[] = [];
  const visit = (index: number): void => {
    if (found || exhausted) return;
    if (index === blocks.length) {
      if (searched >= maxOrientationCandidates) { exhausted = true; return; }
      searched += 1;
      const candidate = fromCycles(value.p, value.q, selected);
      if (analyzeAnnularNoncrossing(candidate).isNoncrossing) found = candidate;
      return;
    }
    for (const cycle of orientedCycles(blocks[index] ?? [])) {
      selected.push(cycle); visit(index + 1); selected.pop();
      if (found || exhausted) return;
    }
  };
  visit(0);
  return Object.freeze({
    status: found ? "found" : exhausted ? "auto-orient-search-exhausted" : "no-annular-noncrossing-orientation",
    value: found,
    searchedOrientationCandidates: searched,
    maxOrientationCandidates,
  });
}

/** Compatibility helper implementing the documented deterministic first-admissible policy. */
export function canonicalizeAnnularBlocks(value: AnnularPermutation): AnnularPermutation | null {
  return resolveCanonicalAnnularBlocks(value).value;
}

function boundaryValue(text: string, name: "p" | "q"): number | AnnularInputError {
  const maximum = name === "p" ? INPUT_LIMITS.annularP : INPUT_LIMITS.annularQ;
  const parsed = parseBoundedPositiveInteger(text, maximum);
  if (parsed.ok) return parsed.value;
  if (parsed.reason === "input-too-long") return { kind: "input-limit", message: `${name} is too long; the supported maximum is ${INPUT_LIMITS.numericInputCharacters} characters.` };
  if (parsed.reason === "too-large") return { kind: "input-limit", message: `This visualizer currently supports ${name} ≤ ${maximum} and p+q ≤ ${INPUT_LIMITS.annularTotalSupport}.` };
  if (parsed.reason === "unsafe-integer") return { kind: "input-limit", message: `${name} is outside the supported safe integer range.` };
  return { kind: "syntax-domain", message: `${name} is required and must be a positive decimal integer.` };
}

export function annularParseErrorMessage(error: AnnularError, p: number, q: number): string {
  switch (error.kind) {
    case "out-of-range-label": return `Label ${error.label} exceeds p+q=${p + q}.`;
    case "duplicate-label": return `Label ${error.label} occurs in more than one cycle.`;
    case "non-positive-label": return `Labels must be positive; found ${error.label}.`;
    case "non-integer-label": return `Expected an integer label near position ${error.position + 1}.`;
    case "malformed-syntax": return `${error.message} (position ${error.position + 1}).`;
    case "invalid-boundary-size": return "p and q must be positive integers.";
    case "boundary-size-too-large": return `This visualizer currently supports p ≤ ${error.maximumP}, q ≤ ${error.maximumQ}, and p+q ≤ ${error.maximumTotal}.`;
    case "input-too-long": return `Input is too long; the supported maximum is ${error.maximum} characters.`;
    case "unsafe-integer": return `Integer near position ${error.position + 1} is outside safe integer syntax.`;
    case "label-too-large": return `Label ${error.labelText} exceeds the supported maximum ${error.maximum}.`;
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
  if (p + q > INPUT_LIMITS.annularTotalSupport) return { ok: false, error: { kind: "input-limit", message: `This visualizer currently supports annular diagrams with p+q ≤ ${INPUT_LIMITS.annularTotalSupport}.` } };

  const parsed = parseAnnularPermutation(notation, p, q);
  if (!parsed.ok) {
    const kind: AnnularInputErrorKind = parsed.error.kind === "input-too-long"
      || parsed.error.kind === "unsafe-integer"
      || parsed.error.kind === "label-too-large"
      || parsed.error.kind === "boundary-size-too-large"
      ? "input-limit"
      : "syntax-domain";
    return { ok: false, error: { kind, message: annularParseErrorMessage(parsed.error, p, q) } };
  }

  const sourceNotation = annularPermutationToString(parsed.value);
  const canonical = interpretation === "canonical-blocks" ? resolveCanonicalAnnularBlocks(parsed.value) : null;
  if (canonical?.status === "auto-orient-search-exhausted") return { ok: false, error: { kind: "auto-orient-search-exhausted", message: `Auto-orient search exhausted its ${canonical.maxOrientationCandidates}-candidate budget before proving a result.` } };
  const resolved = canonical ? canonical.value : parsed.value;
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
