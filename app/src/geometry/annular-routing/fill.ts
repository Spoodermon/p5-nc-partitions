import type { Point } from "../annular";
import type { RoutedAnnularEdge } from "./types";

export interface AnnularCycleFillRegion {
  readonly cycleIndex: number;
  readonly points: readonly Point[];
  readonly area: number;
}

function polygonArea(points: readonly Point[]): number {
  if (points.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index] as Point;
    const next = points[(index + 1) % points.length] as Point;
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

/** Samples each directed edge in cycle order to form its complete closed region. */
export function annularCycleFillRegions(
  routes: readonly RoutedAnnularEdge[],
  segmentsPerEdge = 80,
): readonly AnnularCycleFillRegion[] {
  if (!Number.isInteger(segmentsPerEdge) || segmentsPerEdge < 2) {
    throw new RangeError("segmentsPerEdge must be an integer of at least two");
  }
  const cycleIndices = [...new Set(routes.map((route) => route.edge.cycleIndex))];
  const regions = cycleIndices.map((cycleIndex) => {
    const cycleRoutes = routes
      .filter((route) => route.edge.cycleIndex === cycleIndex)
      .sort((first, second) => first.edge.edgeIndex - second.edge.edgeIndex);
    const points = cycleRoutes.flatMap((candidate, edgeIndex) =>
      Array.from(
        { length: segmentsPerEdge + (edgeIndex === 0 ? 1 : 0) },
        (_, sampleIndex) => candidate.route.pointAt((sampleIndex + (edgeIndex === 0 ? 0 : 1)) / segmentsPerEdge),
      ));
    return Object.freeze({ cycleIndex, points: Object.freeze(points), area: polygonArea(points) });
  });
  // Large regions are painted first so nested singleton and collar fills stay
  // visible instead of being covered by a later disconnected component.
  return Object.freeze(regions.sort((first, second) => second.area - first.area || first.cycleIndex - second.cycleIndex));
}
