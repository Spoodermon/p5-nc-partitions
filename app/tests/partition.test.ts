import { describe, expect, it } from "vitest";
import {
  equalPartitions,
  equalPermutations,
  parseDiscPartition,
  partitionToPermutation,
  partitionToString,
} from "../src/math";

function parse(input: string) {
  const result = parseDiscPartition(input);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

describe("partition canonicalization", () => {
  it("treats textual cycle orientations as the same set partition", () => {
    const inputs = ["(1 2 3)", "(3 1 2)", "(1 3 2)"].map(parse);
    expect(inputs.map(partitionToString)).toEqual(["(1 2 3)", "(1 2 3)", "(1 2 3)"]);
    expect(equalPartitions(inputs[0]!, inputs[1]!)).toBe(true);
    expect(equalPermutations(partitionToPermutation(inputs[0]!), partitionToPermutation(inputs[2]!))).toBe(true);
  });

  it("does not mutate source objects", () => {
    const partition = parse("(3 1 2)");
    const before = JSON.stringify(partition);
    partitionToPermutation(partition);
    expect(JSON.stringify(partition)).toBe(before);
    expect(Object.isFrozen(partition)).toBe(true);
    expect(Object.isFrozen(partition.blocks)).toBe(true);
    expect(Object.isFrozen(partition.blocks[0])).toBe(true);
  });
});
