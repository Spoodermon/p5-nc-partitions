import { describe, expect, it } from "vitest";
import {
  annularLongCycle,
  annularPermutationFromImages,
  annularPermutationToString,
  classifiedAnnularCycles,
  identityAnnularPermutation,
  innerLabels,
  isAnnularConnected,
  isAnnularNoncrossing,
  outerLabels,
  parseAnnularPermutation,
  throughCycleCount,
} from "../src/math";

function parse(input: string, p: number, q: number) {
  const result = parseAnnularPermutation(input, p, q);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

describe("annular permutation domain", () => {
  it("enforces boundaries and exposes mathematical label sets", () => {
    expect(outerLabels(5, 3)).toEqual([1, 2, 3, 4, 5]);
    expect(innerLabels(5, 3)).toEqual([6, 7, 8]);
    expect(Object.isFrozen(outerLabels(2, 1))).toBe(true);
    expect(annularPermutationFromImages(2, 2, [1, 2, 3]).ok).toBe(false);
    expect(() => identityAnnularPermutation(0, 2)).toThrow(RangeError);
  });

  it("constructs gamma_{p,q} in mathematical boundary order", () => {
    expect(annularPermutationToString(annularLongCycle(5, 3))).toBe("(1 2 3 4 5)(6 7 8)");
    expect(annularPermutationToString(annularLongCycle(1, 1))).toBe("(1)(2)");
  });

  it("classifies cycles and connectedness algebraically", () => {
    const value = parse("(1 8)(2)(3 4 7)(5 6)", 5, 3);
    expect(classifiedAnnularCycles(value).map(({ kind }) => kind)).toEqual([
      "through",
      "outer",
      "through",
      "through",
    ]);
    expect(throughCycleCount(value)).toBe(3);
    expect(isAnnularConnected(value)).toBe(true);

    const gamma = annularLongCycle(5, 3);
    expect(classifiedAnnularCycles(gamma).map(({ kind }) => kind)).toEqual(["outer", "inner"]);
    expect(isAnnularConnected(gamma)).toBe(false);
    expect(isAnnularNoncrossing(gamma)).toBe(true);
  });

  it("freezes the annular wrapper and preserves its underlying permutation", () => {
    const value = parse("(1 3)(2)(4)", 2, 2);
    const before = JSON.stringify(value);
    classifiedAnnularCycles(value);
    expect(JSON.stringify(value)).toBe(before);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.permutation)).toBe(true);
    expect(Object.isFrozen(value.permutation.images)).toBe(true);
  });
});
