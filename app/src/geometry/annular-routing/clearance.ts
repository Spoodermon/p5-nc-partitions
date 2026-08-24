import type { AnnularLayout, Point } from "../annular";
import { analyzeRoutePair } from "./intersections";
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

export function analyzeRouteClearance(
  routes: readonly AnnularRouteCandidate[],
  layout: AnnularLayout,
  hardClearance: number,
  commonEndpointRadius: number,
): ClearanceAnalysis {
  let hardCollisionCount = 0;
  let worstPair: RoutePairDiagnostic | null = null;
  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      const pair = analyzeRoutePair(routes[i] as AnnularRouteCandidate, routes[j] as AnnularRouteCandidate, commonEndpointRadius);
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

