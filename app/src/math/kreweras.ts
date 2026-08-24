import { partitionFromPermutation } from "./partition";
import {
  composePermutations,
  invertPermutation,
  longCycle,
  partitionToPermutation,
} from "./permutation";
import type { DiscPartition } from "./types";

// Convention: gamma_n = (1 2 ... n), products compose as
// (sigma tau)(i) = sigma(tau(i)), and K(pi) = pi^{-1} gamma_n.
export function krewerasComplement(partition: DiscPartition): DiscPartition {
  const sigma = partitionToPermutation(partition);
  const complementPermutation = composePermutations(invertPermutation(sigma), longCycle(partition.n));
  return partitionFromPermutation(complementPermutation);
}
