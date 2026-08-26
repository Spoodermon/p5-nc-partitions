import { INPUT_LIMITS } from "../../config/limits";
import { createPermutation, identityPermutation } from "../permutation";
import type { Permutation } from "../types";
import {
  annularFailure,
  annularSuccess,
  type AnnularPermutation,
  type AnnularResult,
} from "./types";

export function validAnnularBoundarySizes(p: number, q: number): boolean {
  return Number.isSafeInteger(p) && p >= 1 && Number.isSafeInteger(q) && q >= 1
    && p <= INPUT_LIMITS.annularP && q <= INPUT_LIMITS.annularQ && p + q <= INPUT_LIMITS.annularTotalSupport;
}

function invalidBoundaryResult(p: number, q: number): AnnularResult<never> {
  if (!Number.isSafeInteger(p) || p < 1 || !Number.isSafeInteger(q) || q < 1) {
    return annularFailure({ kind: "invalid-boundary-size", p, q });
  }
  return annularFailure({ kind: "boundary-size-too-large", p, q, maximumP: INPUT_LIMITS.annularP, maximumQ: INPUT_LIMITS.annularQ, maximumTotal: INPUT_LIMITS.annularTotalSupport });
}

export function createAnnularPermutation(
  p: number,
  q: number,
  permutation: Permutation,
): AnnularResult<AnnularPermutation> {
  if (!validAnnularBoundarySizes(p, q)) {
    return invalidBoundaryResult(p, q);
  }
  if (permutation.n !== p + q) {
    return annularFailure({ kind: "support-size-mismatch", expected: p + q, actual: permutation.n });
  }
  return annularSuccess(Object.freeze({ p, q, permutation }));
}

export function guaranteedAnnularPermutation(p: number, q: number, permutation: Permutation): AnnularPermutation {
  const result = createAnnularPermutation(p, q, permutation);
  if (!result.ok) throw new RangeError(`Invalid annular permutation: ${result.error.kind}`);
  return result.value;
}

export function identityAnnularPermutation(p: number, q: number): AnnularPermutation {
  if (!validAnnularBoundarySizes(p, q)) {
    throw new RangeError("p and q must be positive integers");
  }
  return guaranteedAnnularPermutation(p, q, identityPermutation(p + q));
}

export function annularPermutationFromImages(
  p: number,
  q: number,
  images: readonly number[],
): AnnularResult<AnnularPermutation> {
  if (!validAnnularBoundarySizes(p, q)) {
    return invalidBoundaryResult(p, q);
  }
  const permutation = createPermutation(images);
  if (!permutation.ok) {
    const message = permutation.error.kind === "invalid-permutation" ? permutation.error.message : permutation.error.kind;
    return annularFailure({ kind: "invalid-permutation", message });
  }
  return createAnnularPermutation(p, q, permutation.value);
}

export function outerLabels(p: number, q: number): readonly number[] {
  if (!validAnnularBoundarySizes(p, q)) throw new RangeError("p and q must be positive integers");
  return Object.freeze(Array.from({ length: p }, (_, index) => index + 1));
}

export function innerLabels(p: number, q: number): readonly number[] {
  if (!validAnnularBoundarySizes(p, q)) throw new RangeError("p and q must be positive integers");
  return Object.freeze(Array.from({ length: q }, (_, index) => p + index + 1));
}
