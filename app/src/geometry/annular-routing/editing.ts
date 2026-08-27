import { ROUTING_POLICY } from "../../config/routingPolicy";
import {
  createCoverCubicAnnularRoute,
  sampleAnnularRoute,
  type CoverCubicAnnularRoute,
  type CoverCubicControlPoint,
  type Point,
} from "../annular";
import { segmentDistance } from "./intersections";
import { verifyRouteSet } from "./verification";
import type { AnnularRouteCandidate, RoutedAnnularSuccess } from "./types";

export interface CoverCubicControlEdit {
  readonly control1: CoverCubicControlPoint;
  readonly control2: CoverCubicControlPoint;
}

export type AnnularRouteEditResult =
  | { readonly ok: true; readonly routed: RoutedAnnularSuccess }
  | { readonly ok: false; readonly reason: "not-editable" | "invalid-controls" | "self-intersection" | "collision" | "verification-failed" };

export function isEditableCoverCubic(candidate: AnnularRouteCandidate | undefined): candidate is AnnularRouteCandidate & { readonly route: CoverCubicAnnularRoute } {
  return candidate?.routeFamily === "cover-cubic"
    && candidate.edge.role !== "singleton"
    && (candidate.route as { readonly family?: unknown }).family === "cover-cubic";
}

function finiteControl(control: CoverCubicControlPoint): boolean {
  return Number.isFinite(control.theta) && Number.isFinite(control.u) && control.u >= 0 && control.u <= 1;
}

export function createEditedCoverCubicRoute(
  routed: RoutedAnnularSuccess,
  candidate: AnnularRouteCandidate & { readonly route: CoverCubicAnnularRoute },
  controls: CoverCubicControlEdit,
): CoverCubicAnnularRoute {
  const [start, , , end] = candidate.route.controlPoints;
  return createCoverCubicAnnularRoute(routed.layout, {
    startLabel: candidate.edge.startLabel,
    endLabel: candidate.edge.endLabel,
    startLiftAngle: start.theta,
    endLiftAngle: end.theta,
    control1: controls.control1,
    control2: controls.control2,
  });
}

function routeLength(route: CoverCubicAnnularRoute): number {
  const samples = sampleAnnularRoute(route, ROUTING_POLICY.renderSampleCount);
  return samples.slice(1).reduce((sum, point, index) => {
    const previous = samples[index] as { readonly x: number; readonly y: number };
    return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

function cross(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }, c: { readonly x: number; readonly y: number }): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }, point: { readonly x: number; readonly y: number }): boolean {
  return cross(a, b, point) === 0
    && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
    && point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y);
}

function segmentsTouch(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
  c: { readonly x: number; readonly y: number },
  d: { readonly x: number; readonly y: number },
): boolean {
  const abC = cross(a, b, c); const abD = cross(a, b, d);
  const cdA = cross(c, d, a); const cdB = cross(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  return (abC === 0 && onSegment(a, b, c))
    || (abD === 0 && onSegment(a, b, d))
    || (cdA === 0 && onSegment(c, d, a))
    || (cdB === 0 && onSegment(c, d, b));
}

export function routePolylineHasSelfContact(
  samples: readonly Point[],
  approximationTolerance: number = ROUTING_POLICY.verificationTolerance,
): boolean {
  if (!Number.isFinite(approximationTolerance) || approximationTolerance < 0
    || samples.length < 2
    || samples.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return true;
  const margin = approximationTolerance * 2;
  // Adjacent pieces share a sample by construction. Every non-adjacent pair,
  // including i/i+2, is checked for exact crossing or overlap. More separated
  // pieces additionally reserve the analytical two-tolerance error margin.
  for (let first = 0; first < samples.length - 1; first += 1) {
    for (let second = first + 2; second < samples.length - 1; second += 1) {
      const a = samples[first] as { readonly x: number; readonly y: number };
      const b = samples[first + 1] as { readonly x: number; readonly y: number };
      const c = samples[second] as { readonly x: number; readonly y: number };
      const d = samples[second + 1] as { readonly x: number; readonly y: number };
      if (segmentsTouch(a, b, c, d)) return true;
      if (second >= first + 3 && segmentDistance(a, b, c, d) <= margin) return true;
    }
  }
  return false;
}

/**
 * Rebuild one cover-space cubic and admit it only after the same analytical,
 * adaptive clearance verification used by production routing. The input
 * diagram is immutable and is therefore also the caller's rollback state.
 */
export function verifyAnnularRouteControlEdit(
  routed: RoutedAnnularSuccess,
  edgeId: string,
  controls: CoverCubicControlEdit,
): AnnularRouteEditResult {
  const index = routed.routes.findIndex((candidate) => candidate.edge.id === edgeId);
  const current = routed.routes[index];
  if (!isEditableCoverCubic(current)) return Object.freeze({ ok: false, reason: "not-editable" as const });
  if (!finiteControl(controls.control1) || !finiteControl(controls.control2)) {
    return Object.freeze({ ok: false, reason: "invalid-controls" as const });
  }
  let route: CoverCubicAnnularRoute;
  try {
    route = createEditedCoverCubicRoute(routed, current, controls);
  } catch {
    return Object.freeze({ ok: false, reason: "invalid-controls" as const });
  }
  const edited: AnnularRouteCandidate = Object.freeze({
    ...current,
    route,
    samples: sampleAnnularRoute(route, ROUTING_POLICY.renderSampleCount),
    winding: route.winding,
    excursion: route.excursion,
    angularBias: route.angularBias,
    routeLength: routeLength(route),
    key: `manual:${current.edge.id}:${controls.control1.theta}:${controls.control1.u}:${controls.control2.theta}:${controls.control2.u}`,
  });
  const candidates = routed.routes.map((candidate, routeIndex) => routeIndex === index ? edited : candidate);
  const hardClearance = routed.diagnostics.requestedHardClearance ?? ROUTING_POLICY.hardClearance;
  const commonEndpointRadius = routed.diagnostics.requestedCommonEndpointRadius ?? ROUTING_POLICY.commonEndpointRadius;
  const verified = verifyRouteSet(candidates, routed.layout, hardClearance, commonEndpointRadius);
  if (!verified.ok) return Object.freeze({ ok: false, reason: verified.analysis ? "collision" as const : "verification-failed" as const });
  const verifiedEdit = verified.routes[index];
  if (!verifiedEdit || routePolylineHasSelfContact(verifiedEdit.samples)) {
    return Object.freeze({ ok: false, reason: "self-intersection" as const });
  }
  const throughRoutes = Object.freeze(verified.routes.flatMap((candidate) => {
    if (candidate.principalWinding === undefined || candidate.principalAngularDisplacement === undefined) return [];
    const selectedAngularDisplacement = candidate.route.angularDisplacement;
    return [Object.freeze({
      edgeId: candidate.edge.id,
      principalWinding: candidate.principalWinding,
      selectedWinding: candidate.winding,
      principalAngularDisplacement: candidate.principalAngularDisplacement,
      selectedAngularDisplacement,
      routeLength: candidate.routeLength ?? 0,
      principalClassProvenInfeasible: false,
      excessiveAngularTravel: Math.abs(selectedAngularDisplacement) > Math.abs(candidate.principalAngularDisplacement) + Math.PI / 2,
    })];
  }));
  const {
    phaseScore: _phaseScore,
    routeScore: _routeScore,
    preferredClearanceDeficit: _preferredClearanceDeficit,
    ...baseDiagnostics
  } = routed.diagnostics;
  return Object.freeze({
    ok: true,
    routed: Object.freeze({
      ...routed,
      routes: verified.routes,
      diagnostics: Object.freeze({
        ...baseDiagnostics,
        ...verified.analysis,
        requestedHardClearance: hardClearance,
        requestedCommonEndpointRadius: commonEndpointRadius,
        throughRoutes,
        principalThroughFallbackUsed: throughRoutes.some((candidate) => candidate.selectedWinding !== candidate.principalWinding),
        manualGeometryOverride: true,
        manualEditCount: (routed.diagnostics.manualEditCount ?? 0) + 1,
      }),
    }),
  });
}
