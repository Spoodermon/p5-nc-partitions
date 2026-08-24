import { describe, expect, it } from "vitest";
import { parseDiscPartition, parseNoncrossingPartition, partitionToString } from "../src/math";

function canonical(input: string): string {
  const result = parseDiscPartition(input);
  if (!result.ok) throw new Error(result.error.kind);
  return partitionToString(result.value);
}

describe("disc partition parser", () => {
  it("accepts whitespace and canonicalizes block orientation and order", () => {
    expect(canonical("( 1   4 ) (2 3)")).toBe("(1 4)(2 3)");
    expect(canonical("(1 2 3)")).toBe("(1 2 3)");
    expect(canonical("(3 1 2)")).toBe("(1 2 3)");
    expect(canonical("(1 3 2)")).toBe("(1 2 3)");
    expect(canonical("(3)(2 4)(1)")).toBe("(1)(2 4)(3)");
    expect(canonical("(2 3)(4 1)")).toBe("(1 4)(2 3)");
  });

  it.each([
    ["", "empty-input"],
    ["(1 2", "malformed-syntax"],
    ["1 2)", "malformed-syntax"],
    ["(1,,2)", "malformed-syntax"],
    ["(1 a 2)", "non-integer-label"],
    ["(1 2)(2 3)", "duplicate-label"],
    ["(0 1)", "non-positive-label"],
    ["(-1 2)", "non-positive-label"],
    ["(1 1)", "duplicate-label"],
    ["(1 3)", "missing-support"],
    ["(2 3)", "missing-support"],
  ])("rejects %s with %s", (input, kind) => {
    const result = parseDiscPartition(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe(kind);
  });

  it("returns a structured crossing error", () => {
    const result = parseNoncrossingPartition("(1 3)(2 4)");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ kind: "crossing-partition", witness: [1, 2, 3, 4] });
  });
});
