import { createPermutation, identityPermutation } from "../permutation";
import type { Permutation } from "../types";
import {
  annularFailure,
  annularSuccess,
  type AnnularPermutation,
  type AnnularResult,
} from "./types";

export function validAnnularBoundarySizes(p: number, q: number): boolean {
  return Number.isInteger(p) && p >= 1 && Number.isInteger(q) && q >= 1;
}

export function createAnnularPermutation(
  p: number,
  q: number,
  permutation: Permutation,
): AnnularResult<AnnularPermutation> {
  if (!validAnnularBoundarySizes(p, q)) {
    return annularFailure({ kind: "invalid-boundary-size", p, q });
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
    return annularFailure({ kind: "invalid-boundary-size", p, q });
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
