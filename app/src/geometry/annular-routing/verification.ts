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

const VERIFICATION_FAILURE = Object.freeze({ ok: false, reason: "geometry-verification-failed" as const });

function isFinitePoint(point: unknown): point is Point {
  if (typeof point !== "object" || point === null) return false;
  try {
    const candidate = point as { readonly x?: unknown; readonly y?: unknown };
    return typeof candidate.x === "number" && Number.isFinite(candidate.x)
      && typeof candidate.y === "number" && Number.isFinite(candidate.y);
  } catch {
    return false;
  }
}

function safePointAt(route: AnnularRoute, t: number): Point | null {
  try {
    const point = route.pointAt(t);
    return isFinitePoint(point) ? point : null;
  } catch {
    return null;
  }
}

function hasFiniteLayoutGeometry(layout: AnnularLayout): boolean {
  try {
    if (!isFinitePoint(layout.center)) return false;
    if (!Number.isFinite(layout.outerRadius)
      || !Number.isFinite(layout.innerRadius)
      || !Number.isFinite(layout.innerPhase)
      || !Array.isArray(layout.vertices)) return false;
    for (let index = 0; index < layout.vertices.length; index += 1) {
      const vertex = layout.vertices[index];
      if (vertex === undefined || !Number.isFinite(vertex.angle)
        || !isFinitePoint(vertex.boundaryPoint) || !isFinitePoint(vertex.labelPoint)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isConservativeClearance(value: number): boolean {
  return value === Number.POSITIVE_INFINITY || (Number.isFinite(value) && value >= 0);
}

function isValidClearanceAnalysis(analysis: ClearanceAnalysis): boolean {
  return Number.isInteger(analysis.hardCollisionCount) && analysis.hardCollisionCount >= 0
    && isConservativeClearance(analysis.minimumClearance)
    && (analysis.worstPair === null || isConservativeClearance(analysis.worstPair.clearance));
}

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
  let maximumSecondDerivative: number;
  try {
    maximumSecondDerivative = route.maximumSecondDerivative;
  } catch {
    return VERIFICATION_FAILURE;
  }
  if (!Number.isFinite(tolerance) || tolerance <= 0
    || !Number.isInteger(maximumDepth) || maximumDepth < 0
    || !Number.isInteger(maximumSegments) || maximumSegments < 1
    || !Number.isFinite(maximumSecondDerivative) || maximumSecondDerivative < 0) {
    return VERIFICATION_FAILURE;
  }
  const start = safePointAt(route, 0);
  const end = safePointAt(route, 1);
  if (start === null || end === null) return VERIFICATION_FAILURE;
  const points: Point[] = [start];
  let segments = 0;
  let failed = false;
  const visit = (t0: number, start: Point, t1: number, end: Point, depth: number): void => {
    if (failed) return;
    const delta = t1 - t0;
    const interpolationErrorBound = maximumSecondDerivative * delta * delta / 8;
    if (!Number.isFinite(interpolationErrorBound)) { failed = true; return; }
    if (interpolationErrorBound <= tolerance) {
      segments += 1;
      if (segments > maximumSegments) { failed = true; return; }
      points.push(end);
      return;
    }
    if (depth >= maximumDepth) { failed = true; return; }
    const mid = safePointAt(route, t0 + delta * 0.5);
    if (mid === null) { failed = true; return; }
    visit(t0, start, t0 + delta * 0.5, mid, depth + 1);
    visit(t0 + delta * 0.5, mid, t1, end, depth + 1);
  };
  visit(0, start, 1, end, 0);
  return failed
    ? VERIFICATION_FAILURE
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
  if (!Array.isArray(routes) || !hasFiniteLayoutGeometry(layout)
    || !Number.isFinite(hardClearance) || hardClearance < 0
    || !Number.isFinite(commonEndpointRadius) || commonEndpointRadius < 0) return VERIFICATION_FAILURE;
  const verified: AnnularRouteCandidate[] = [];
  try {
    for (const candidate of routes) {
      const sampled = adaptiveRouteSamples(candidate.route);
      if (!sampled.ok) return sampled;
      verified.push(Object.freeze({ ...candidate, samples: sampled.samples }));
    }
  } catch {
    return VERIFICATION_FAILURE;
  }
  const margin = verificationClearanceMargin();
  let rawAnalysis: ClearanceAnalysis;
  try {
    rawAnalysis = analyzeRouteClearance(verified, layout, hardClearance + margin, commonEndpointRadius, ROUTING_POLICY.verificationTolerance);
  } catch {
    return VERIFICATION_FAILURE;
  }
  if (!isValidClearanceAnalysis(rawAnalysis)) return VERIFICATION_FAILURE;
  const analysis = conservativeClearance(rawAnalysis, margin);
  if (rawAnalysis.hardCollisionCount !== 0 || analysis.minimumClearance < hardClearance) return Object.freeze({ ok: false, reason: "geometry-verification-failed" as const, analysis, routes: Object.freeze(verified) });
  return Object.freeze({ ok: true, analysis, routes: Object.freeze(verified) });
}
