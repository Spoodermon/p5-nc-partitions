import { createAnnularRoute, createCoverCubicAnnularRoute, type AnnularRouteOptions, type CoverCubicAnnularRoute, type CoverCubicRouteOptions } from "../geometry/annular";
import type { AnnularRouteCandidate, RoutedAnnularSuccess } from "../geometry/annular-routing";
import type { AcceptedAnnularInput } from "./annularController";
import type { AnnularTaskResult } from "./annularTask";

type RouteDefinition =
  | { readonly family: "cover-cubic"; readonly options: CoverCubicRouteOptions }
  | { readonly family: "analytical-bump"; readonly options: AnnularRouteOptions };
type TransportRoute = Omit<AnnularRouteCandidate, "route"> & { readonly definition: RouteDefinition };
type TransportDiagram = Omit<RoutedAnnularSuccess, "routes"> & { readonly routes: readonly TransportRoute[] };
export type TransportTaskResult =
  | { readonly ok: true; readonly accepted: Omit<AcceptedAnnularInput, "routed"> & { readonly routed: TransportDiagram }; readonly message?: string }
  | Extract<AnnularTaskResult, { readonly ok: false }>;

/** Transfer constructor data and verified samples, never non-clonable closures. */
export function packAnnularResult(result: AnnularTaskResult): TransportTaskResult {
  if (!result.ok) return result;
  const routed = result.accepted.routed;
  const routes = routed.routes.map(({ route, ...candidate }): TransportRoute => {
    const definition: RouteDefinition = candidate.routeFamily === "cover-cubic"
      ? { family: "cover-cubic", options: {
        startLabel: route.startLabel, endLabel: route.endLabel,
        startLiftAngle: route.startLiftAngle, endLiftAngle: route.endLiftAngle,
        control1: (route as CoverCubicAnnularRoute).controlPoints[1],
        control2: (route as CoverCubicAnnularRoute).controlPoints[2],
      } }
      : { family: "analytical-bump", options: {
        startLabel: route.startLabel, endLabel: route.endLabel, winding: route.winding,
        excursion: route.excursion, angularBias: route.angularBias,
      } };
    return { ...candidate, definition };
  });
  return { ...result, accepted: { ...result.accepted, routed: { ...routed, routes } } };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** Reconstitute the same route family without repeating search on the UI thread. */
export function unpackAnnularResult(result: TransportTaskResult): AnnularTaskResult {
  if (!result.ok) return Object.freeze(result);
  const routed = result.accepted.routed;
  const routes = routed.routes.map(({ definition, ...candidate }): AnnularRouteCandidate => ({
    ...candidate,
    route: definition.family === "cover-cubic"
      ? createCoverCubicAnnularRoute(routed.layout, definition.options)
      : createAnnularRoute(routed.layout, definition.options),
  }));
  return deepFreeze({ ...result, accepted: { ...result.accepted, routed: { ...routed, routes } } });
}
