import { describe, expect, it } from "vitest";
import {
  annularPermutationToString,
  equalPermutations,
  parseAnnularPermutation,
} from "../src/math";

function parse(input: string, p = 2, q = 2) {
  const result = parseAnnularPermutation(input, p, q);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

describe("annular permutation parser and serialization", () => {
  it("preserves orientation while canonicalizing cycle rotation and cycle order", () => {
    const oriented = parse("(1 3 2)");
    const sameRotation = parse("(3 2 1)");
    const sameRotationAgain = parse("(2 1 3)");
    const oppositeOrientation = parse("(1 2 3)");

    expect(equalPermutations(oriented.permutation, sameRotation.permutation)).toBe(true);
    expect(equalPermutations(oriented.permutation, sameRotationAgain.permutation)).toBe(true);
    expect(equalPermutations(oriented.permutation, oppositeOrientation.permutation)).toBe(false);
    expect(annularPermutationToString(oriented)).toBe("(1 3 2)(4)");
    expect(annularPermutationToString(oppositeOrientation)).toBe("(1 2 3)(4)");
    expect(annularPermutationToString(parse("(5 6)(1 8)(2)(3 4 7)", 5, 3))).toBe(
      "(1 8)(2)(3 4 7)(5 6)",
    );
  });

  it("infers omitted labels as fixed points and serializes them explicitly", () => {
    const omitted = parse("(1 3)");
    const explicit = parse("(1 3)(2)(4)");
    const emptyIdentity = parse("   ");
    expect(equalPermutations(omitted.permutation, explicit.permutation)).toBe(true);
    expect(annularPermutationToString(omitted)).toBe("(1 3)(2)(4)");
    expect(annularPermutationToString(emptyIdentity)).toBe("(1)(2)(3)(4)");
  });

  it.each([
    ["(1 a 2)", 2, 2, "non-integer-label"],
    ["(0 1)", 2, 2, "non-positive-label"],
    ["(-1 2)", 2, 2, "non-positive-label"],
    ["(1 5)", 2, 2, "out-of-range-label"],
    ["(1 2)(2 3)", 2, 2, "duplicate-label"],
    ["(1 1)", 2, 2, "duplicate-label"],
    ["(1 2", 2, 2, "malformed-syntax"],
    ["1 2)", 2, 2, "malformed-syntax"],
    ["(1,,2)", 2, 2, "malformed-syntax"],
    ["()", 2, 2, "malformed-syntax"],
    ["(1)", 0, 2, "invalid-boundary-size"],
  ])("rejects invalid input %s", (input, p, q, kind) => {
    const result = parseAnnularPermutation(input, p, q);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe(kind);
  });
});
