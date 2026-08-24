import type { Point } from "../annular";
import type { AnnularRouteCandidate, RoutePairDiagnostic } from "./types";

const EPSILON = 1e-7;

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < EPSILON) return pointDistance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function properIntersection(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON));
}

function boxesFar(a: Point, b: Point, c: Point, d: Point, margin: number): boolean {
  return Math.max(a.x, b.x) + margin < Math.min(c.x, d.x)
    || Math.max(c.x, d.x) + margin < Math.min(a.x, b.x)
    || Math.max(a.y, b.y) + margin < Math.min(c.y, d.y)
    || Math.max(c.y, d.y) + margin < Math.min(a.y, b.y);
}

export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (properIntersection(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

function sharedLabels(first: AnnularRouteCandidate, second: AnnularRouteCandidate): readonly number[] {
  const firstLabels = [first.edge.startLabel, first.edge.endLabel];
  const secondLabels = new Set([second.edge.startLabel, second.edge.endLabel]);
  return [...new Set(firstLabels.filter((label) => secondLabels.has(label)))];
}

function nearSharedEndpoint(point: Point, shared: readonly Point[], radius: number): boolean {
  return shared.some((endpoint) => pointDistance(point, endpoint) < radius);
}

export function analyzeRoutePair(
  first: AnnularRouteCandidate,
  second: AnnularRouteCandidate,
  commonEndpointRadius = 18,
): RoutePairDiagnostic {
  const labels = sharedLabels(first, second);
  const sharedPoints = labels.map((label) => {
    if (label === first.edge.startLabel) return first.samples[0] as Point;
    return first.samples[first.samples.length - 1] as Point;
  });
  let clearance = Number.POSITIVE_INFINITY;
  let intersects = false;
  let coincidentSegments = 0;

  for (let i = 0; i < first.samples.length - 1; i += 1) {
    const a = first.samples[i] as Point;
    const b = first.samples[i + 1] as Point;
    for (let j = 0; j < second.samples.length - 1; j += 1) {
      const c = second.samples[j] as Point;
      const d = second.samples[j + 1] as Point;
      if (sharedPoints.length > 0
        && nearSharedEndpoint(a, sharedPoints, commonEndpointRadius)
        && nearSharedEndpoint(b, sharedPoints, commonEndpointRadius)
        && nearSharedEndpoint(c, sharedPoints, commonEndpointRadius)
        && nearSharedEndpoint(d, sharedPoints, commonEndpointRadius)) continue;
      const distance = segmentDistance(a, b, c, d);
      clearance = Math.min(clearance, distance);
      if (distance <= EPSILON) intersects = true;
      if (distance <= 0.2 && Math.abs(cross(a, b, c)) < 0.5 && Math.abs(cross(a, b, d)) < 0.5) {
        coincidentSegments += 1;
      }
    }
  }
  return Object.freeze({
    firstEdgeId: first.edge.id,
    secondEdgeId: second.edge.id,
    clearance,
    intersects,
    coincident: coincidentSegments >= 2,
  });
}

export function routesConflict(
  first: AnnularRouteCandidate,
  second: AnnularRouteCandidate,
  hardClearance: number,
  commonEndpointRadius: number,
): boolean {
  const labels = sharedLabels(first, second);
  const sharedPoints = labels.map((label) => label === first.edge.startLabel
    ? first.samples[0] as Point
    : first.samples[first.samples.length - 1] as Point);
  let coincidentSegments = 0;
  for (let i = 0; i < first.samples.length - 1; i += 1) {
    const a = first.samples[i] as Point;
    const b = first.samples[i + 1] as Point;
    for (let j = 0; j < second.samples.length - 1; j += 1) {
      const c = second.samples[j] as Point;
      const d = second.samples[j + 1] as Point;
      if (boxesFar(a, b, c, d, hardClearance)) continue;
      if (sharedPoints.length > 0
        && nearSharedEndpoint(a, sharedPoints, commonEndpointRadius)
        && nearSharedEndpoint(b, sharedPoints, commonEndpointRadius)
        && nearSharedEndpoint(c, sharedPoints, commonEndpointRadius)
        && nearSharedEndpoint(d, sharedPoints, commonEndpointRadius)) continue;
      const distance = segmentDistance(a, b, c, d);
      if (distance < hardClearance) return true;
      if (distance <= 0.2 && Math.abs(cross(a, b, c)) < 0.5 && Math.abs(cross(a, b, d)) < 0.5) {
        coincidentSegments += 1;
        if (coincidentSegments >= 2) return true;
      }
    }
  }
  return false;
}
