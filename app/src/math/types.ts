export type Label = number;
export type Block = readonly Label[];

export interface DiscPartition {
  readonly n: number;
  readonly blocks: readonly Block[];
}

// images[i - 1] is the mathematical image of the 1-based label i.
export interface Permutation {
  readonly n: number;
  readonly images: readonly Label[];
}

export type MathError =
  | { readonly kind: "empty-input" }
  | { readonly kind: "input-too-long"; readonly maximum: number }
  | { readonly kind: "unsafe-integer"; readonly position: number; readonly token: string }
  | { readonly kind: "label-too-large"; readonly position: number; readonly labelText: string; readonly maximum: number }
  | { readonly kind: "support-too-large"; readonly maximum: number }
  | { readonly kind: "malformed-syntax"; readonly position: number; readonly message: string }
  | { readonly kind: "non-integer-label"; readonly position: number; readonly token: string }
  | { readonly kind: "non-positive-label"; readonly position: number; readonly label: number }
  | { readonly kind: "duplicate-label"; readonly label: number }
  | { readonly kind: "missing-support"; readonly missing: readonly number[] }
  | { readonly kind: "invalid-permutation"; readonly message: string }
  | {
      readonly kind: "crossing-partition";
      readonly witness: readonly [number, number, number, number];
    };

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: MathError };

export function success<T>(value: T): Result<T> {
  return Object.freeze({ ok: true, value });
}

export function failure<T>(error: MathError): Result<T> {
  return Object.freeze({ ok: false, error: Object.freeze(error) });
}
