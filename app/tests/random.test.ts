import { describe, expect, it } from "vitest";
import { isNoncrossing, parseAnnularPermutation, randomAnnularBlockNotation, randomNoncrossingPartition } from "../src/math";
import { canonicalizeAnnularBlocks } from "../src/production/annularController";

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 2 ** 32; };
}

describe("random admitted examples", () => {
  it("generates noncrossing disc partitions on the requested support", () => {
    for (let n = 1; n <= 30; n += 1) {
      const partition = randomNoncrossingPartition(n, seeded(n));
      expect(partition.n).toBe(n);
      expect(isNoncrossing(partition)).toBe(true);
    }
  });

  it("generates annular block sets with an admitted canonical orientation", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const notation = randomAnnularBlockNotation(8, 5, seeded(seed));
      const parsed = parseAnnularPermutation(notation, 8, 5);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(canonicalizeAnnularBlocks(parsed.value)).not.toBeNull();
    }
  });
});
