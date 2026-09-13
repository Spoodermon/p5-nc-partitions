import { describe, expect, it } from "vitest";
import {
  analyzeAnnularNoncrossing,
  annularKrewerasComplement,
  annularLongCycle,
  annularPermutationToString,
  composePermutations,
  equalPermutations,
  isAnnularConnected,
  isAnnularNoncrossing,
  parseAnnularPermutation,
} from "../src/math";

function parse(input: string, p: number, q: number) {
  const result = parseAnnularPermutation(input, p, q);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

describe("annular noncrossing and Kreweras operations", () => {
  it("matches the Mingo-Nica (5,3) fixture", () => {
    const tau = parse("(1 8)(2)(3 4 7)(5 6)", 5, 3);
    const complement = annularKrewerasComplement(tau);
    expect(isAnnularConnected(tau)).toBe(true);
    expect(isAnnularNoncrossing(tau)).toBe(true);
    expect(annularPermutationToString(complement)).toBe("(1 2 7)(3)(4 6)(5 8)");
    expect(
      equalPermutations(
        composePermutations(tau.permutation, complement.permutation),
        annularLongCycle(5, 3).permutation,
      ),
    ).toBe(true);
  });

  it("uses the connected and disconnected geodesic sums", () => {
    expect(analyzeAnnularNoncrossing(parse("(1 2)", 1, 1))).toEqual({
      connected: true,
      cycleCount: 1,
      complementCycleCount: 1,
      expectedSum: 2,
      actualSum: 2,
      isNoncrossing: true,
    });
    expect(analyzeAnnularNoncrossing(parse("(1)(2)", 1, 1))).toEqual({
      connected: false,
      cycleCount: 2,
      complementCycleCount: 2,
      expectedSum: 4,
      actualSum: 4,
      isNoncrossing: true,
    });
  });

  it("rejects exactly the two known oriented (2,2) fixtures", () => {
    expect(isAnnularNoncrossing(parse("(1 3 2 4)", 2, 2))).toBe(false);
    expect(isAnnularNoncrossing(parse("(1 4 2 3)", 2, 2))).toBe(false);
  });
});
