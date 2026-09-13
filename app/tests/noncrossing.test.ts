import { describe, expect, it } from "vitest";
import { isNoncrossing, parseDiscPartition } from "../src/math";

function parse(input: string) {
  const result = parseDiscPartition(input);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

describe("partition-level noncrossing criterion", () => {
  it.each(["(1 4)(2 3)", "(1 2 3)(4 5)", "(1 6)(2 5)(3 4)"])("accepts %s", (input) => {
    expect(isNoncrossing(parse(input))).toBe(true);
  });

  it.each(["(1 3)(2 4)", "(1 4)(2 5)(3)(6)"])("rejects %s", (input) => {
    expect(isNoncrossing(parse(input))).toBe(false);
  });
});
