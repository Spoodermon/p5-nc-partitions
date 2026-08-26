import { describe, expect, it } from "vitest";
import { routeAnnularPermutation } from "../src/geometry/annular-routing";
import { createDiscPartition, isNoncrossing, parseAnnularPermutation } from "../src/math";

function parsed(text: string, p: number, q: number) {
  const result = parseAnnularPermutation(text, p, q);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

function measure<T>(name: string, operation: () => T): { readonly value: T; readonly milliseconds: number } {
  const start = performance.now();
  const value = operation();
  const milliseconds = performance.now() - start;
  console.info(`Benchmark ${name}: ${milliseconds.toFixed(3)} ms`);
  return { value, milliseconds };
}

describe("NCV-7 representative performance diagnostics", () => {
  it("records bounded validator and router timings", () => {
    const disc = createDiscPartition([
      Array.from({ length: 200 }, (_, index) => index + 1),
      Array.from({ length: 200 }, (_, index) => index + 201),
    ]);
    if (!disc.ok) throw new Error(disc.error.kind);
    const discTiming = measure("disc-n400-two-block", () => isNoncrossing(disc.value));
    expect(discTiming.value).toBe(true);
    expect(discTiming.milliseconds).toBeLessThan(150);

    const ordinary = measure("ordinary-annular", () => routeAnnularPermutation(parsed("(1 4)(2)(3)(5)", 3, 2)));
    const mingo = measure("mingo-nica", () => routeAnnularPermutation(parsed("(1 8)(2)(3 4 7)(5 6)", 5, 3)));
    const large = measure("large-production", () => routeAnnularPermutation(parsed("(1 11)(2 3 16)(4 5 6)(7 13)(8)(9 12)(10)(14 15)(17)", 10, 7)));
    expect(ordinary.value.isRoutable).toBe(true);
    expect(mingo.value.isRoutable).toBe(true);
    expect(large.value.isRoutable).toBe(true);
    expect(ordinary.milliseconds).toBeLessThan(5_000);
    expect(mingo.milliseconds).toBeLessThan(10_000);
    expect(large.milliseconds).toBeLessThan(5_000);
  }, 30_000);
});
