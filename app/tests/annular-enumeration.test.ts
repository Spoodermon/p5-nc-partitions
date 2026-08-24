import { describe, expect, it } from "vitest";
import {
  analyzeAnnularNoncrossing,
  annularKrewerasComplement,
  annularLongCycle,
  annularPermutationFromImages,
  annularPermutationToString,
  composePermutations,
  equalPermutations,
  isAnnularConnected,
} from "../src/math";
import { catalan, expectedConnectedAnnularCount, permutationImages } from "./helpers/permutations";

describe("exhaustive annular enumeration through total support 8", () => {
  it("finds 22 valid and exactly two invalid permutations for (2,2)", () => {
    const rejected: string[] = [];
    let accepted = 0;
    const permutations = [...permutationImages(4)];
    for (const images of permutations) {
      const result = annularPermutationFromImages(2, 2, images);
      if (!result.ok) throw new Error(result.error.kind);
      if (analyzeAnnularNoncrossing(result.value).isNoncrossing) accepted += 1;
      else rejected.push(annularPermutationToString(result.value));
    }
    expect(permutations).toHaveLength(24);
    expect(accepted).toBe(22);
    expect(rejected.sort()).toEqual(["(1 3 2 4)", "(1 4 2 3)"]);
  });

  it("matches connected and disconnected formulas and preserves complement invariants", () => {
    for (let n = 2; n <= 8; n += 1) {
      const permutations = [...permutationImages(n)];
      for (let p = 1; p < n; p += 1) {
        const q = n - p;
        let connectedCount = 0;
        let disconnectedCount = 0;

        for (const images of permutations) {
          const result = annularPermutationFromImages(p, q, images);
          if (!result.ok) throw new Error(result.error.kind);
          const tau = result.value;
          const complement = annularKrewerasComplement(tau);

          expect(
            equalPermutations(
              composePermutations(tau.permutation, complement.permutation),
              annularLongCycle(p, q).permutation,
            ),
          ).toBe(true);

          const analysis = analyzeAnnularNoncrossing(tau);
          if (!analysis.isNoncrossing) continue;
          expect(analyzeAnnularNoncrossing(complement).isNoncrossing).toBe(true);
          expect(isAnnularConnected(complement)).toBe(analysis.connected);
          if (analysis.connected) connectedCount += 1;
          else disconnectedCount += 1;
        }

        expect(disconnectedCount, `disconnected count for (${p},${q})`).toBe(catalan(p) * catalan(q));
        expect(connectedCount, `connected count for (${p},${q})`).toBe(expectedConnectedAnnularCount(p, q));
      }
    }
  });
});
