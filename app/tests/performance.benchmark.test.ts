import { describe, expect, it } from "vitest";
import { routeAnnularPermutation } from "../src/geometry/annular-routing";
import { createDiscPartition, isNoncrossing, parseAnnularPermutation } from "../src/math";

function parsed(text: string, p: number, q: number) {
  const result = parseAnnularPermutation(text, p, q);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

function measure<T>(name: string, operation: () => T): T {
  const start = performance.now();
  const result = operation();
  console.info(`Benchmark ${name}: ${(performance.now() - start).toFixed(3)} ms`);
  return result;
}

describe("NCV-7 representative performance diagnostics", () => {
  it("records bounded validator and router timings", () => {
    const disc = createDiscPartition([
      Array.from({ length: 200 }, (_, index) => index + 1),
      Array.from({ length: 200 }, (_, index) => index + 201),
    ]);
    if (!disc.ok) throw new Error(disc.error.kind);
    expect(measure("disc-n400-two-block", () => isNoncrossing(disc.value))).toBe(true);

    const ordinary = measure("ordinary-annular", () => routeAnnularPermutation(parsed("(1 4)(2)(3)(5)", 3, 2)));
    const mingo = measure("mingo-nica", () => routeAnnularPermutation(parsed("(1 8)(2)(3 4 7)(5 6)", 5, 3)));
    const large = measure("large-production", () => routeAnnularPermutation(parsed("(1 11)(2 3 16)(4 5 6)(7 13)(8)(9 12)(10)(14 15)(17)", 10, 7)));
    expect(ordinary.isRoutable).toBe(true);
    expect(mingo.isRoutable).toBe(true);
    expect(large.isRoutable).toBe(true);
  }, 30_000);
});
