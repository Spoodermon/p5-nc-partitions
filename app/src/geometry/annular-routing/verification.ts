import { ROUTING_POLICY } from "../../config/routingPolicy";
import type { AnnularLayout, AnnularRoute, Point } from "../annular";
import { analyzeRouteClearance, type ClearanceAnalysis } from "./clearance";
import type { AnnularRouteCandidate } from "./types";

export interface VerificationOptions {
  readonly tolerance?: number;
  readonly maximumDepth?: number;
  readonly maximumSegmentsPerRoute?: number;
}

export type AdaptiveRouteSamples =
  | { readonly ok: true; readonly samples: readonly Point[] }
  | { readonly ok: false; readonly reason: "geometry-verification-failed" };

/**
 * Subdivide until the linear-interpolation remainder bound M·Δt²/8 is within
 * tolerance. `maximumSecondDerivative` is an analytical global bound for the
 * production route family, so this bounds the complete subcurve rather than
 * selected probe points.
 */
export function adaptiveRouteSamples(route: AnnularRoute, options: VerificationOptions = {}): AdaptiveRouteSamples {
  const tolerance = options.tolerance ?? ROUTING_POLICY.verificationTolerance;
  const maximumDepth = options.maximumDepth ?? ROUTING_POLICY.verificationMaxDepth;
  const maximumSegments = options.maximumSegmentsPerRoute ?? ROUTING_POLICY.verificationMaxSegmentsPerRoute;
  if (!Number.isFinite(tolerance) || tolerance <= 0
    || !Number.isInteger(maximumDepth) || maximumDepth < 0
    || !Number.isInteger(maximumSegments) || maximumSegments < 1
    || !Number.isFinite(route.maximumSecondDerivative) || route.maximumSecondDerivative < 0) {
    return Object.freeze({ ok: false, reason: "geometry-verification-failed" as const });
  }
  const points: Point[] = [route.pointAt(0)];
  let segments = 0;
  let failed = false;
  const visit = (t0: number, start: Point, t1: number, end: Point, depth: number): void => {
    if (failed) return;
    const delta = t1 - t0;
    const interpolationErrorBound = route.maximumSecondDerivative * delta * delta / 8;
    if (interpolationErrorBound <= tolerance) {
      segments += 1;
      if (segments > maximumSegments) { failed = true; return; }
      points.push(end);
      return;
    }
    if (depth >= maximumDepth) { failed = true; return; }
    const mid = route.pointAt(t0 + delta * 0.5);
    visit(t0, start, t0 + delta * 0.5, mid, depth + 1);
    visit(t0 + delta * 0.5, mid, t1, end, depth + 1);
  };
  visit(0, points[0] as Point, 1, route.pointAt(1), 0);
  return failed
    ? Object.freeze({ ok: false, reason: "geometry-verification-failed" as const })
    : Object.freeze({ ok: true, samples: Object.freeze(points) });
}

export type RouteSetVerification =
  | { readonly ok: true; readonly analysis: ClearanceAnalysis; readonly routes: readonly AnnularRouteCandidate[] }
  | { readonly ok: false; readonly reason: "geometry-verification-failed"; readonly analysis?: ClearanceAnalysis; readonly routes?: readonly AnnularRouteCandidate[] };

export function verificationClearanceMargin(): number {
  return ROUTING_POLICY.verificationTolerance * ROUTING_POLICY.verificationClearanceSafetyFactor;
}

function conservativeClearance(analysis: ClearanceAnalysis, margin: number): ClearanceAnalysis {
  const minimumClearance = Number.isFinite(analysis.minimumClearance)
    ? Math.max(0, analysis.minimumClearance - margin)
    : analysis.minimumClearance;
  const worstPair = analysis.worstPair === null ? null : Object.freeze({
    ...analysis.worstPair,
    clearance: Math.max(0, analysis.worstPair.clearance - margin),
  });
  return Object.freeze({ ...analysis, minimumClearance, worstPair });
}

export function verifyRouteSet(routes: readonly AnnularRouteCandidate[], layout: AnnularLayout, hardClearance: number, commonEndpointRadius: number): RouteSetVerification {
  const verified: AnnularRouteCandidate[] = [];
  for (const candidate of routes) {
    const sampled = adaptiveRouteSamples(candidate.route);
    if (!sampled.ok) return sampled;
    verified.push(Object.freeze({ ...candidate, samples: sampled.samples }));
  }
  const margin = verificationClearanceMargin();
  const rawAnalysis = analyzeRouteClearance(verified, layout, hardClearance + margin, commonEndpointRadius, ROUTING_POLICY.verificationTolerance);
  const analysis = conservativeClearance(rawAnalysis, margin);
  if (rawAnalysis.hardCollisionCount !== 0 || analysis.minimumClearance < hardClearance) return Object.freeze({ ok: false, reason: "geometry-verification-failed" as const, analysis, routes: Object.freeze(verified) });
  return Object.freeze({ ok: true, analysis, routes: Object.freeze(verified) });
}
