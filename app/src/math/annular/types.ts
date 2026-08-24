import type { Permutation } from "../types";

export interface AnnularPermutation {
  readonly p: number;
  readonly q: number;
  readonly permutation: Permutation;
}

export type AnnularCycleKind = "outer" | "inner" | "through";

export interface ClassifiedAnnularCycle {
  readonly cycle: readonly number[];
  readonly kind: AnnularCycleKind;
}

export interface AnnularNoncrossingAnalysis {
  readonly connected: boolean;
  readonly cycleCount: number;
  readonly complementCycleCount: number;
  readonly expectedSum: number;
  readonly actualSum: number;
  readonly isNoncrossing: boolean;
}

export type AnnularError =
  | { readonly kind: "invalid-boundary-size"; readonly p: number; readonly q: number }
  | { readonly kind: "support-size-mismatch"; readonly expected: number; readonly actual: number }
  | { readonly kind: "malformed-syntax"; readonly position: number; readonly message: string }
  | { readonly kind: "non-integer-label"; readonly position: number; readonly token: string }
  | { readonly kind: "non-positive-label"; readonly position: number; readonly label: number }
  | { readonly kind: "out-of-range-label"; readonly position: number; readonly label: number; readonly maximum: number }
  | { readonly kind: "duplicate-label"; readonly label: number }
  | { readonly kind: "invalid-permutation"; readonly message: string };

export type AnnularResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AnnularError };

export function annularSuccess<T>(value: T): AnnularResult<T> {
  return Object.freeze({ ok: true, value });
}

export function annularFailure<T>(error: AnnularError): AnnularResult<T> {
  return Object.freeze({ ok: false, error: Object.freeze(error) });
}
