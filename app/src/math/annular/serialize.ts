import { permutationToCycleString } from "../serialize";
import type { AnnularPermutation } from "./types";

// Generic permutation serialization rotates cycles to their minimum label and orders cycles by that label.
// It does not sort elements within a cycle, so orientation is preserved. Fixed points are included.
export function annularPermutationToString(value: AnnularPermutation): string {
  return permutationToCycleString(value.permutation);
}
