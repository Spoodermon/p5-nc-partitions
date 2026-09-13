import { describe, expect, it } from "vitest";
import {
  applyPermutation,
  composePermutations,
  createPermutation,
  equalPermutations,
  identityPermutation,
  invertPermutation,
  longCycle,
  permutationCycles,
  permutationToCycleString,
} from "../src/math";

describe("permutation operations", () => {
  it("uses 1-based labels and a after b composition", () => {
    const aResult = createPermutation([2, 1, 3]);
    const bResult = createPermutation([1, 3, 2]);
    if (!aResult.ok || !bResult.ok) throw new Error("Invalid test permutation");

    const composed = composePermutations(aResult.value, bResult.value);
    expect(composed.images).toEqual([2, 3, 1]);
    expect(applyPermutation(composed, 2)).toBe(applyPermutation(aResult.value, applyPermutation(bResult.value, 2)));
  });

  it("implements identity, inverse, long cycle, cycles, and equality", () => {
    const gamma = longCycle(4);
    expect(gamma.images).toEqual([2, 3, 4, 1]);
    expect(permutationToCycleString(gamma)).toBe("(1 2 3 4)");
    expect(permutationCycles(identityPermutation(3))).toEqual([[1], [2], [3]]);
    expect(equalPermutations(composePermutations(gamma, invertPermutation(gamma)), identityPermutation(4))).toBe(true);
  });

  it("rejects non-bijections and preserves inputs", () => {
    expect(createPermutation([1, 1]).ok).toBe(false);
    const gamma = longCycle(5);
    const before = JSON.stringify(gamma);
    invertPermutation(gamma);
    expect(JSON.stringify(gamma)).toBe(before);
    expect(Object.isFrozen(gamma.images)).toBe(true);
  });
});
