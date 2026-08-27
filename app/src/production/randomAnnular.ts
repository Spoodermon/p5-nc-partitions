import { routeAnnularPermutation, type RoutedAnnularDiagram, type RoutedAnnularSuccess } from "../geometry/annular-routing";
import {
  annularPermutationToString,
  minimalConnectedAnnularNoncrossingPermutation,
  randomConnectedAnnularNoncrossingPermutation,
  type AnnularPermutation,
  type AnnularRandomDensity,
  type RandomSource,
} from "../math";

export type AnnularRandomMode = "auto" | AnnularRandomDensity;

export const RANDOM_ANNULAR_ROUTING_POLICY = Object.freeze({
  maximumAttempts: 4,
  maximumElapsedMilliseconds: 1_500,
  sparseDefaultSupport: 12,
});

export type RouteAwareRandomAnnularResult =
  | {
    readonly ok: true;
    readonly permutation: AnnularPermutation;
    readonly routed: RoutedAnnularSuccess;
    readonly requestedMode: AnnularRandomMode;
    readonly density: AnnularRandomDensity;
    readonly attempts: number;
    readonly usedSparseFallback: boolean;
    readonly usedMinimalFallback: boolean;
  }
  | {
    readonly ok: false;
    readonly requestedMode: AnnularRandomMode;
    readonly attempts: number;
    readonly lastFailure: Extract<RoutedAnnularDiagram, { readonly isRoutable: false }> | null;
  };

export type AnnularRandomRouter = (value: AnnularPermutation) => RoutedAnnularDiagram;

export function defaultAnnularRandomDensity(p: number, q: number): AnnularRandomDensity {
  return p + q >= RANDOM_ANNULAR_ROUTING_POLICY.sparseDefaultSupport ? "sparse" : "balanced";
}

function densitySchedule(mode: AnnularRandomMode, p: number, q: number): readonly AnnularRandomDensity[] {
  const selected = mode === "auto" ? defaultAnnularRandomDensity(p, q) : mode;
  if (selected === "dense") return Object.freeze(["dense", "balanced", "sparse"]);
  if (selected === "balanced") return Object.freeze(["balanced", "sparse", "sparse"]);
  return Object.freeze(["sparse", "sparse", "sparse"]);
}

/**
 * Try connected ANC structures from the requested distribution, progressively
 * simplifying within fixed attempt/time bounds. A deterministic through
 * transposition is always tried last, even after the soft elapsed-time limit.
 */
export function routeAwareRandomAnnularPermutation(
  p: number,
  q: number,
  mode: AnnularRandomMode = "auto",
  random: RandomSource = Math.random,
  router: AnnularRandomRouter = routeAnnularPermutation,
): RouteAwareRandomAnnularResult {
  if (!["auto", "sparse", "balanced", "dense"].includes(mode)) throw new RangeError("unknown annular random mode");
  const schedule = densitySchedule(mode, p, q);
  const started = performance.now();
  const seen = new Set<string>();
  let attempts = 0;
  let lastFailure: Extract<RoutedAnnularDiagram, { readonly isRoutable: false }> | null = null;
  let terminalFailure = false;

  const tryCandidate = (permutation: AnnularPermutation, density: AnnularRandomDensity, minimal = false): RouteAwareRandomAnnularResult | null => {
    const key = annularPermutationToString(permutation);
    if (seen.has(key)) return null;
    seen.add(key);
    attempts += 1;
    const routed = router(permutation);
    if (!routed.isRoutable) {
      lastFailure = routed;
      terminalFailure = routed.reason === "invalid-mathematical-input" || routed.reason === "invalid-routing-options";
      return null;
    }
    const requestedDensity = mode === "auto" ? defaultAnnularRandomDensity(p, q) : mode;
    return Object.freeze({
      ok: true,
      permutation,
      routed,
      requestedMode: mode,
      density,
      attempts,
      usedSparseFallback: density === "sparse" && requestedDensity !== "sparse",
      usedMinimalFallback: minimal,
    });
  };

  for (const density of schedule.slice(0, Math.max(0, RANDOM_ANNULAR_ROUTING_POLICY.maximumAttempts - 1))) {
    if (attempts > 0 && performance.now() - started >= RANDOM_ANNULAR_ROUTING_POLICY.maximumElapsedMilliseconds) break;
    const result = tryCandidate(randomConnectedAnnularNoncrossingPermutation(p, q, random, density), density);
    if (result) return result;
    if (terminalFailure) return Object.freeze({ ok: false, requestedMode: mode, attempts, lastFailure });
  }

  // A fixed bridge between the two boundary orbits is the lowest-complexity
  // genuine connected ANC. It is a fallback in geometry, not in mathematics.
  const deterministicSparse = minimalConnectedAnnularNoncrossingPermutation(p, q);
  const fallback = tryCandidate(deterministicSparse, "sparse", true);
  if (fallback) return fallback;
  return Object.freeze({ ok: false, requestedMode: mode, attempts, lastFailure });
}
