import { describe, expect, it } from "vitest";
import { generateSetPartitions, isNoncrossing } from "../src/math";

describe("Catalan verification", () => {
  it("counts disc noncrossing partitions through n=8", () => {
    const expected = [1, 2, 5, 14, 42, 132, 429, 1430];
    const observed = expected.map((_, index) => generateSetPartitions(index + 1).filter(isNoncrossing).length);
    expect(observed).toEqual(expected);
  });
});
