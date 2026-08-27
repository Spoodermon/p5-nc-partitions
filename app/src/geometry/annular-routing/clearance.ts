import type { AnnularLayout, Point } from "../annular";
import { analyzeRoutePair, hasFiniteRouteSamples } from "./intersections";
import type { AnnularRouteCandidate, RoutePairDiagnostic } from "./types";

export interface ClearanceAnalysis {
  readonly hardCollisionCount: number;
  readonly minimumClearance: number;
  readonly worstPair: RoutePairDiagnostic | null;
  readonly labelWarnings: readonly string[];
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function invalidClearanceAnalysis(): ClearanceAnalysis {
  return Object.freeze({
    hardCollisionCount: 1,
    minimumClearance: 0,
    worstPair: null,
    labelWarnings: Object.freeze(["invalid route geometry"]),
  });
}

function hasFiniteLabelGeometry(layout: unknown): layout is AnnularLayout {
  if (typeof layout !== "object" || layout === null) return false;
  try {
    const vertices = (layout as { readonly vertices?: unknown }).vertices;
    if (!Array.isArray(vertices) || vertices.length === 0) return false;
    return vertices.every((vertex) => {
      const labelPoint = (vertex as { readonly labelPoint?: { readonly x?: unknown; readonly y?: unknown } } | null)?.labelPoint;
      return typeof labelPoint?.x === "number" && Number.isFinite(labelPoint.x)
        && typeof labelPoint.y === "number" && Number.isFinite(labelPoint.y);
    });
  } catch {
    return false;
  }
}

function analyzeFiniteRouteClearance(
  routes: readonly AnnularRouteCandidate[],
  layout: AnnularLayout,
  hardClearance: number,
  commonEndpointRadius: number,
  approximationTolerance = 0,
): ClearanceAnalysis {
  let hardCollisionCount = 0;
  let worstPair: RoutePairDiagnostic | null = null;
  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      const pair = analyzeRoutePair(routes[i] as AnnularRouteCandidate, routes[j] as AnnularRouteCandidate, commonEndpointRadius, approximationTolerance);
      if (pair.intersects || pair.coincident || pair.clearance < hardClearance) hardCollisionCount += 1;
      if (worstPair === null || pair.clearance < worstPair.clearance) worstPair = pair;
    }
  }

  const labelWarnings: string[] = [];
  for (const route of routes) {
    for (const vertex of layout.vertices) {
      if (vertex.label === route.edge.startLabel || vertex.label === route.edge.endLabel) continue;
      if (route.samples.some((point) => distance(point, vertex.labelPoint) < 22)) {
        labelWarnings.push(`${route.edge.id} near label ${vertex.label}`);
      }
    }
  }
  return Object.freeze({
    hardCollisionCount,
    minimumClearance: worstPair?.clearance ?? Number.POSITIVE_INFINITY,
    worstPair,
    labelWarnings: Object.freeze(labelWarnings),
  });
}

export function analyzeRouteClearance(
  routes: readonly AnnularRouteCandidate[],
  layout: AnnularLayout,
  hardClearance: number,
  commonEndpointRadius: number,
  approximationTolerance = 0,
): ClearanceAnalysis {
  if (!Number.isFinite(hardClearance) || hardClearance < 0
    || !Number.isFinite(commonEndpointRadius) || commonEndpointRadius < 0
    || !Number.isFinite(approximationTolerance) || approximationTolerance < 0) {
    throw new RangeError("clearance, endpoint radius, and approximation tolerance must be finite and nonnegative");
  }
  try {
    if (!Array.isArray(routes) || !hasFiniteLabelGeometry(layout)
      || routes.some((route) => !hasFiniteRouteSamples(route))) return invalidClearanceAnalysis();
    return analyzeFiniteRouteClearance(routes, layout, hardClearance, commonEndpointRadius, approximationTolerance);
  } catch {
    return invalidClearanceAnalysis();
  }
}
