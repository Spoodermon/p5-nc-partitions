import { composePermutations, invertPermutation } from "../permutation";
import { guaranteedAnnularPermutation } from "./domain";
import { annularLongCycle } from "./gamma";
import type { AnnularPermutation } from "./types";

// K_{p,q}(tau) = tau^{-1} gamma_{p,q}; composition is (sigma tau)(i) = sigma(tau(i)).
export function annularKrewerasComplement(value: AnnularPermutation): AnnularPermutation {
  const gamma = annularLongCycle(value.p, value.q);
  const complement = composePermutations(invertPermutation(value.permutation), gamma.permutation);
  return guaranteedAnnularPermutation(value.p, value.q, complement);
}
