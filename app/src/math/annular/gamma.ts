import { createPermutation } from "../permutation";
import { guaranteedAnnularPermutation, validAnnularBoundarySizes } from "./domain";
import type { AnnularPermutation } from "./types";

// gamma_{p,q} = (1 ... p)(p+1 ... p+q) in the mathematical boundary order.
// Future inner-boundary screen placement must not reverse this permutation cycle.
export function annularLongCycle(p: number, q: number): AnnularPermutation {
  if (!validAnnularBoundarySizes(p, q)) throw new RangeError("p and q must be positive integers");
  const n = p + q;
  const images = Array.from({ length: n }, (_, index) => {
    const label = index + 1;
    if (label < p) return label + 1;
    if (label === p) return 1;
    if (label < n) return label + 1;
    return p + 1;
  });
  const permutation = createPermutation(images);
  if (!permutation.ok) throw new Error("Annular long-cycle construction failed");
  return guaranteedAnnularPermutation(p, q, permutation.value);
}
