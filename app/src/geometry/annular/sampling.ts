import type { AnnularRoute, Point } from "./types";

export function sampleAnnularRoute(route: AnnularRoute, count: number): readonly Point[] {
  if (!Number.isInteger(count) || count < 2) throw new RangeError("sample count must be an integer of at least 2");
  return Object.freeze(Array.from({ length: count }, (_, index) => route.pointAt(index / (count - 1))));
}
