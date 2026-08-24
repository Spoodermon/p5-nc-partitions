import type { AnnularLayout, CoverPoint, Point } from "./types";

function requireUnitInterval(u: number): void {
  if (!Number.isFinite(u) || u < 0 || u > 1) throw new RangeError("u must be finite and in [0,1]");
}

export function coverRadius(layout: AnnularLayout, u: number): number {
  requireUnitInterval(u);
  return layout.innerRadius * (layout.outerRadius / layout.innerRadius) ** u;
}

export function coverPointToCartesian(layout: AnnularLayout, point: CoverPoint): Point {
  if (!Number.isFinite(point.theta)) throw new RangeError("theta must be finite");
  const radius = coverRadius(layout, point.u);
  return Object.freeze({
    x: layout.center.x + radius * Math.cos(point.theta),
    y: layout.center.y + radius * Math.sin(point.theta),
  });
}

export function cartesianToCoverPoint(layout: AnnularLayout, point: Point): CoverPoint {
  const x = point.x - layout.center.x;
  const y = point.y - layout.center.y;
  const radius = Math.hypot(x, y);
  const tolerance = 1e-9;
  if (radius < layout.innerRadius - tolerance || radius > layout.outerRadius + tolerance) {
    throw new RangeError("point must lie in the closed annulus");
  }
  const containedRadius = Math.min(layout.outerRadius, Math.max(layout.innerRadius, radius));
  return Object.freeze({
    theta: Math.atan2(y, x),
    u: Math.log(containedRadius / layout.innerRadius) / Math.log(layout.outerRadius / layout.innerRadius),
  });
}
