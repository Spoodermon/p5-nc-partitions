import type { AnnularRoute, Point } from "./types";
import { ROUTING_POLICY } from "../../config/routingPolicy";

export function sampleAnnularRoute(route: AnnularRoute, count: number): readonly Point[] {
  if (!Number.isInteger(count) || count < 2 || count > ROUTING_POLICY.maximumStandaloneSampleCount) throw new RangeError(`sample count must be an integer in [2,${ROUTING_POLICY.maximumStandaloneSampleCount}]`);
  return Object.freeze(Array.from({ length: count }, (_, index) => route.pointAt(index / (count - 1))));
}
