import { describe, expect, it } from "vitest";
import {
  composePermutations,
  equalPartitions,
  equalPermutations,
  generateSetPartitions,
  isNoncrossing,
  krewerasComplement,
  longCycle,
  parseDiscPartition,
  partitionToPermutation,
  partitionToString,
} from "../src/math";

function parse(input: string) {
  const result = parseDiscPartition(input);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

describe("Kreweras complement", () => {
  it("uses K(pi) = pi^-1 gamma_n for extreme and nontrivial cases", () => {
    for (let n = 1; n <= 8; n += 1) {
      const discrete = parse(Array.from({ length: n }, (_, index) => `(${index + 1})`).join(""));
      const oneBlock = parse(`(${Array.from({ length: n }, (_, index) => index + 1).join(" ")})`);
      expect(equalPartitions(krewerasComplement(discrete), oneBlock)).toBe(true);
      expect(equalPartitions(krewerasComplement(oneBlock), discrete)).toBe(true);
    }
    expect(partitionToString(krewerasComplement(parse("(1 2)(3)")))).toBe("(1)(2 3)");
  });

  it("preserves noncrossing, block count, and the permutation identity through n=8", () => {
    for (let n = 1; n <= 8; n += 1) {
      const partitions = generateSetPartitions(n).filter(isNoncrossing);
      for (const partition of partitions) {
        const before = JSON.stringify(partition);
        const complement = krewerasComplement(partition);
        expect(isNoncrossing(complement)).toBe(true);
        expect(partition.blocks.length + complement.blocks.length).toBe(n + 1);
        expect(
          equalPermutations(
            composePermutations(partitionToPermutation(partition), partitionToPermutation(complement)),
            longCycle(n),
          ),
        ).toBe(true);
        expect(JSON.stringify(partition)).toBe(before);
      }
    }
  });
});
