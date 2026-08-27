import { describe, expect, it } from "vitest";
import { routeAnnularPermutation, type RoutedAnnularFailure } from "../src/geometry/annular-routing";
import { annularPermutationToString, minimalConnectedAnnularNoncrossingPermutation, type AnnularPermutation } from "../src/math";
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

  it("returns a routed genuine ANC on the previously exhausted large supports", () => {
    for (const [p, q] of [[8, 5], [12, 12], [20, 4], [16, 8], [10, 10]] as const) {
      const result = routeAwareRandomAnnularPermutation(p, q, "auto", seeded(p * 100 + q));
      expect(result.ok, `(p,q)=(${p},${q})`).toBe(true);
      expect(result.attempts).toBeLessThanOrEqual(4);
      if (result.ok) expect(result.routed.permutation).toBe(result.permutation);
    }
  }, 20_000);
});
