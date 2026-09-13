import { describe, expect, it } from "vitest";
import { routeAnnularPermutation, type RoutedAnnularFailure } from "../src/geometry/annular-routing";
import {
  annularPermutationToString,
  minimalConnectedAnnularNoncrossingPermutation,
  minimalFixedPointFreeConnectedAnnularNoncrossingPermutation,
  permutationCycles,
  type AnnularPermutation,
} from "../src/math";
import { defaultAnnularRandomDensity, routeAwareRandomAnnularPermutation } from "../src/production/randomAnnular";

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 2 ** 32; };
}

function boundedFailure(value: AnnularPermutation, reason: RoutedAnnularFailure["reason"] = "search-limit-exceeded"): RoutedAnnularFailure {
  const reference = routeAnnularPermutation(minimalConnectedAnnularNoncrossingPermutation(value.p, value.q));
  return {
    isRoutable: false,
    permutation: value,
    reason,
    diagnostics: {
      ...reference.diagnostics,
      searchNodes: 5,
      maxSearchNodes: 5,
      exhaustedResources: reason === "search-limit-exceeded" ? ["search-nodes"] : [],
    },
  };
}

function hasNoSingletonCycles(value: AnnularPermutation): boolean {
  return permutationCycles(value.permutation).every((cycle) => cycle.length >= 2);
}

describe("route-aware random ANC", () => {
  it("defaults large supports to sparse at the production large-path threshold", () => {
    expect(defaultAnnularRandomDensity(6, 5)).toBe("balanced");
    expect(defaultAnnularRandomDensity(6, 6)).toBe("sparse");
  });

  it("progressively simplifies and ends with the deterministic genuine connected fallback", () => {
    let calls = 0;
    const result = routeAwareRandomAnnularPermutation(8, 5, "dense", seeded(914), (value) => {
      calls += 1;
      return calls < 4 ? boundedFailure(value) : routeAnnularPermutation(value);
    });
    expect(result.ok).toBe(true);
    expect(calls).toBe(4);
    if (!result.ok) return;
    expect(result.attempts).toBe(4);
    expect(result.usedMinimalFallback).toBe(true);
    expect(result.density).toBe("sparse");
    expect(annularPermutationToString(result.permutation)).toBe(annularPermutationToString(minimalConnectedAnnularNoncrossingPermutation(8, 5)));
  });

  it("never exceeds four bounded route attempts and stops on invariant failures", () => {
    let boundedCalls = 0;
    const exhausted = routeAwareRandomAnnularPermutation(8, 5, "balanced", seeded(16), (value) => {
      boundedCalls += 1;
      return boundedFailure(value);
    });
    expect(exhausted.ok).toBe(false);
    expect(boundedCalls).toBeLessThanOrEqual(4);

    let terminalCalls = 0;
    const terminal = routeAwareRandomAnnularPermutation(4, 3, "dense", seeded(2), (value) => {
      terminalCalls += 1;
      return boundedFailure(value, "invalid-routing-options");
    });
    expect(terminal.ok).toBe(false);
    expect(terminalCalls).toBe(1);
  });

  it("never relaxes the singleton-free constraint across random candidates or fallback", () => {
    const fallback = minimalFixedPointFreeConnectedAnnularNoncrossingPermutation(3, 2);
    const fallbackKey = annularPermutationToString(fallback);
    const routedCandidates: AnnularPermutation[] = [];
    const result = routeAwareRandomAnnularPermutation(3, 2, "dense", () => 0, (value) => {
      routedCandidates.push(value);
      expect(hasNoSingletonCycles(value), annularPermutationToString(value)).toBe(true);
      return annularPermutationToString(value) === fallbackKey
        ? routeAnnularPermutation(value)
        : boundedFailure(value);
    }, { singletonCycles: "forbid" });

    expect(result.ok).toBe(true);
    expect(routedCandidates.length).toBeLessThanOrEqual(4);
    expect(routedCandidates.length).toBeGreaterThanOrEqual(2);
    expect(routedCandidates.every(hasNoSingletonCycles)).toBe(true);
    if (!result.ok) return;
    expect(result.usedMinimalFallback).toBe(true);
    expect(result.attempts).toBe(routedCandidates.length);
    expect(annularPermutationToString(result.permutation)).toBe(fallbackKey);
  });

  it("reports a rejected singleton-free random draw and the deterministic fallback separately", () => {
    const fallback = minimalFixedPointFreeConnectedAnnularNoncrossingPermutation(4, 3);
    const fallbackKey = annularPermutationToString(fallback);
    const routedCandidates: AnnularPermutation[] = [];
    const result = routeAwareRandomAnnularPermutation(4, 3, "balanced", () => 1 - Number.EPSILON, (value) => {
      routedCandidates.push(value);
      return annularPermutationToString(value) === fallbackKey
        ? routeAnnularPermutation(value)
        : boundedFailure(value);
    }, { singletonCycles: "forbid" });

    expect(result.ok).toBe(true);
    expect(routedCandidates).toHaveLength(2);
    expect(routedCandidates.every(hasNoSingletonCycles)).toBe(true);
    expect(annularPermutationToString(routedCandidates[0] as AnnularPermutation)).not.toBe(fallbackKey);
    if (!result.ok) return;
    expect(result.attempts).toBe(2);
    expect(result.usedMinimalFallback).toBe(true);
    expect(result.density).toBe("sparse");
    expect(annularPermutationToString(result.permutation)).toBe(fallbackKey);
  });

  it("keeps bounded all-failure and terminal behavior under the singleton-free constraint", () => {
    const allFailureCandidates: AnnularPermutation[] = [];
    const exhausted = routeAwareRandomAnnularPermutation(8, 5, "dense", seeded(4_209), (value) => {
      allFailureCandidates.push(value);
      return boundedFailure(value);
    }, { singletonCycles: "forbid" });
    expect(exhausted.ok).toBe(false);
    if (exhausted.ok) throw new Error("expected bounded singleton-free routing attempts to fail");
    expect(allFailureCandidates.length).toBeLessThanOrEqual(4);
    expect(allFailureCandidates.length).toBeGreaterThan(0);
    expect(allFailureCandidates.every(hasNoSingletonCycles)).toBe(true);
    expect(exhausted.attempts).toBe(allFailureCandidates.length);
    expect(exhausted.lastFailure?.reason).toBe("search-limit-exceeded");

    const terminalCandidates: AnnularPermutation[] = [];
    const terminal = routeAwareRandomAnnularPermutation(8, 5, "balanced", seeded(77), (value) => {
      terminalCandidates.push(value);
      return boundedFailure(value, "invalid-routing-options");
    }, { singletonCycles: "forbid" });
    expect(terminal.ok).toBe(false);
    if (terminal.ok) throw new Error("expected terminal singleton-free routing failure");
    expect(terminalCandidates).toHaveLength(1);
    expect(terminalCandidates.every(hasNoSingletonCycles)).toBe(true);
    expect(terminal.attempts).toBe(1);
    expect(terminal.lastFailure?.reason).toBe("invalid-routing-options");
  });

  it("returns a routed genuine ANC on the previously exhausted large supports", () => {
    for (const [p, q] of [[8, 5], [12, 12], [20, 4], [16, 8], [10, 10]] as const) {
      const result = routeAwareRandomAnnularPermutation(p, q, "auto", seeded(p * 100 + q));
      expect(result.ok, `(p,q)=(${p},${q})`).toBe(true);
      expect(result.attempts).toBeLessThanOrEqual(4);
      if (result.ok) expect(result.routed.permutation).toBe(result.permutation);
    }
  }, 20_000);
});
