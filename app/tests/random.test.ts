import { describe, expect, it } from "vitest";
import { INPUT_LIMITS } from "../src/config/limits";
import {
  analyzeAnnularNoncrossing,
  annularLongCycle,
  applyPermutation,
  isNoncrossing,
  randomConnectedAnnularNoncrossingPermutation,
  minimalConnectedAnnularNoncrossingPermutation,
  minimalFixedPointFreeConnectedAnnularNoncrossingPermutation,
  randomNoncrossingPartition,
  throughCycleCount,
  permutationCycles,
  annularPermutationToString,
  type AnnularPermutation,
} from "../src/math";

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 2 ** 32; };
}

function generatedOrbitSize(value: AnnularPermutation): number {
  const generators = [annularLongCycle(value.p, value.q).permutation, value.permutation];
  const seen = new Set<number>([1]);
  const queue = [1];
  while (queue.length > 0) {
    const label = queue.shift() as number;
    for (const generator of generators) {
      const image = applyPermutation(generator, label);
      if (!seen.has(image)) { seen.add(image); queue.push(image); }
    }
  }
  return seen.size;
}

function expectFixedPointFreeConnectedAnc(value: AnnularPermutation, context: string): void {
  const analysis = analyzeAnnularNoncrossing(value);
  const cycles = permutationCycles(value.permutation);
  expect(analysis.connected, `${context}: connected`).toBe(true);
  expect(analysis.isNoncrossing, `${context}: annular-noncrossing`).toBe(true);
  expect(analysis.actualSum, `${context}: genus equality`).toBe(value.p + value.q);
  expect(throughCycleCount(value), `${context}: through-cycle`).toBeGreaterThanOrEqual(1);
  expect(generatedOrbitSize(value), `${context}: transitive generated action`).toBe(value.p + value.q);
  expect(cycles.every((cycle) => cycle.length >= 2), `${context}: no singleton cycles`).toBe(true);
}

describe("random admitted examples", () => {
  it("generates noncrossing disc partitions on the requested support", () => {
    for (let n = 1; n <= 30; n += 1) {
      const partition = randomNoncrossingPartition(n, seeded(n));
      expect(partition.n).toBe(n);
      expect(isNoncrossing(partition)).toBe(true);
    }
  });

  it("generates connected Mingo–Nica annular-noncrossing permutations on every supported boundary", () => {
    for (let p = 1; p <= 20; p += 1) for (let q = 1; q <= 20 && p + q <= 24; q += 1) {
      const sources = [() => 0, () => 1 - Number.EPSILON, ...Array.from({ length: 16 }, (_, index) => seeded((p * 10_000) + (q * 100) + index))];
      for (const random of sources) {
        const value = randomConnectedAnnularNoncrossingPermutation(p, q, random);
        const analysis = analyzeAnnularNoncrossing(value);
        const context = `(p,q)=(${p},${q}), tau=${value.permutation.images.join(",")}`;
        expect(analysis.connected, context).toBe(true);
        expect(analysis.isNoncrossing, context).toBe(true);
        expect(analysis.actualSum, context).toBe(p + q);
        expect(throughCycleCount(value), context).toBeGreaterThanOrEqual(1);
        expect(generatedOrbitSize(value), context).toBe(p + q);
      }
    }
  });

  it("keeps sparse, balanced, and dense modes mathematically genuine", () => {
    for (const density of ["sparse", "balanced", "dense"] as const) {
      for (let p = 1; p <= 12; p += 1) for (let q = 1; q <= 12 && p + q <= 18; q += 1) {
        const value = randomConnectedAnnularNoncrossingPermutation(p, q, seeded(p * 1_000 + q * 10 + density.length), density);
        const analysis = analyzeAnnularNoncrossing(value);
        expect(analysis.connected).toBe(true);
        expect(analysis.isNoncrossing).toBe(true);
        expect(throughCycleCount(value)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("orders expected structure complexity from sparse through dense", () => {
    const averageCycleCount = (density: "sparse" | "balanced" | "dense") => Array.from({ length: 120 }, (_, seed) =>
      permutationCycles(randomConnectedAnnularNoncrossingPermutation(10, 8, seeded(seed + 1), density).permutation).length,
    ).reduce((sum, count) => sum + count, 0) / 120;
    expect(averageCycleCount("sparse")).toBeGreaterThan(averageCycleCount("balanced"));
    expect(averageCycleCount("balanced")).toBeGreaterThan(averageCycleCount("dense"));
  });

  it("provides a deterministic minimal connected fallback", () => {
    const value = minimalConnectedAnnularNoncrossingPermutation(8, 5);
    expect(annularPermutationToString(value)).toBe("(1 9)(2)(3)(4)(5)(6)(7)(8)(10)(11)(12)(13)");
    expect(analyzeAnnularNoncrossing(value).connected).toBe(true);
    expect(generatedOrbitSize(value)).toBe(13);
  });

  it("provides a deterministic fixed-point-free fallback on every supported annulus", () => {
    for (let p = 1; p <= INPUT_LIMITS.annularP; p += 1) {
      for (let q = 1; q <= INPUT_LIMITS.annularQ && p + q <= INPUT_LIMITS.annularTotalSupport; q += 1) {
        const first = minimalFixedPointFreeConnectedAnnularNoncrossingPermutation(p, q);
        const second = minimalFixedPointFreeConnectedAnnularNoncrossingPermutation(p, q);
        const context = `(p,q)=(${p},${q}), tau=${annularPermutationToString(first)}`;
        expect(annularPermutationToString(second), `${context}: deterministic`).toBe(annularPermutationToString(first));
        expectFixedPointFreeConnectedAnc(first, context);
      }
    }
  });

  it("keeps the fixed-point-free constraint under adversarial random sources", () => {
    const adversarialSources = (p: number, q: number): readonly (() => number)[] => [
      () => 0,
      () => 1 - Number.EPSILON,
      seeded((p * 65_537) + q),
    ];
    for (const density of ["sparse", "balanced", "dense"] as const) {
      for (let p = 1; p <= INPUT_LIMITS.annularP; p += 1) {
        for (let q = 1; q <= INPUT_LIMITS.annularQ && p + q <= INPUT_LIMITS.annularTotalSupport; q += 1) {
          for (const random of adversarialSources(p, q)) {
            const value = randomConnectedAnnularNoncrossingPermutation(
              p,
              q,
              random,
              density,
              { singletonCycles: "forbid" },
            );
            expectFixedPointFreeConnectedAnc(value, `${density} (p,q)=(${p},${q})`);
          }
        }
      }
    }
  });

  it("keeps singleton-free generation diverse after bounded rejection recovery", () => {
    for (const density of ["sparse", "balanced", "dense"] as const) {
      const notations = new Set(Array.from({ length: 64 }, (_, seed) => annularPermutationToString(
        randomConnectedAnnularNoncrossingPermutation(
          12,
          12,
          seeded(seed + (density.length * 10_000)),
          density,
          { singletonCycles: "forbid" },
        ),
      )));
      expect(notations.size, `${density} singleton-free diversity`).toBeGreaterThan(4);
    }
  });

  it("preserves sparse-to-dense structure ordering in singleton-free mode", () => {
    const averageCycleCount = (density: "sparse" | "balanced" | "dense") => Array.from({ length: 160 }, (_, seed) =>
      permutationCycles(randomConnectedAnnularNoncrossingPermutation(
        12,
        10,
        seeded(seed + 1),
        density,
        { singletonCycles: "forbid" },
      ).permutation).length,
    ).reduce((sum, count) => sum + count, 0) / 160;
    expect(averageCycleCount("sparse")).toBeGreaterThan(averageCycleCount("balanced"));
    expect(averageCycleCount("balanced")).toBeGreaterThan(averageCycleCount("dense"));
  });

  it("does not silently substitute the deterministic singleton-free fallback", () => {
    const randomCandidate = randomConnectedAnnularNoncrossingPermutation(
      4,
      3,
      () => 1 - Number.EPSILON,
      "balanced",
      { singletonCycles: "forbid" },
    );
    expectFixedPointFreeConnectedAnc(randomCandidate, "constant-high recovery candidate");
    expect(annularPermutationToString(randomCandidate)).not.toBe(
      annularPermutationToString(minimalFixedPointFreeConnectedAnnularNoncrossingPermutation(4, 3)),
    );
  });
});
