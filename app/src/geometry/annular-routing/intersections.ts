import type { Point } from "../annular";
import type { AnnularRouteCandidate, RoutePairDiagnostic } from "./types";

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
  if (lengthSquared === 0) return pointDistance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function properIntersection(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0))
    && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
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

type SegmentPiece = readonly [Point, Point];

function interpolate(start: Point, end: Point, t: number): Point {
  return Object.freeze({
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  });
}

/** Return the portions of a segment outside all common-endpoint disks. */
function outsideEndpointDisks(
  start: Point,
  end: Point,
  shared: readonly Point[],
  radius: number,
): readonly SegmentPiece[] {
  if (shared.length === 0 || radius <= 0) return Object.freeze([[start, end] as const]);
  let intervals: Array<readonly [number, number]> = [[0, 1]];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const a = dx * dx + dy * dy;
  if (a === 0) return shared.some((center) => pointDistance(start, center) < radius)
    ? Object.freeze([])
    : Object.freeze([[start, end] as const]);

  for (const center of shared) {
    const sx = start.x - center.x;
    const sy = start.y - center.y;
    const b = 2 * (sx * dx + sy * dy);
    const c = sx * sx + sy * sy - radius * radius;
    const discriminant = b * b - 4 * a * c;
    let insideStart = Number.POSITIVE_INFINITY;
    let insideEnd = Number.NEGATIVE_INFINITY;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      insideStart = Math.max(0, (-b - root) / (2 * a));
      insideEnd = Math.min(1, (-b + root) / (2 * a));
    } else if (c < 0) {
      insideStart = 0;
      insideEnd = 1;
    }
    if (insideStart >= insideEnd) continue;
    const next: Array<readonly [number, number]> = [];
    for (const [from, to] of intervals) {
      if (insideEnd <= from || insideStart >= to) next.push([from, to]);
      else {
        if (from < insideStart) next.push([from, Math.min(to, insideStart)]);
        if (insideEnd < to) next.push([Math.max(from, insideEnd), to]);
      }
    }
    intervals = next;
  }
  return Object.freeze(intervals
    .filter(([from, to]) => to > from)
    .map(([from, to]) => Object.freeze([interpolate(start, end, from), interpolate(start, end, to)] as const)));
}

function clippedRouteSegments(
  samples: readonly Point[],
  shared: readonly Point[],
  radius: number,
): readonly SegmentPiece[] {
  const result: SegmentPiece[] = [];
  for (let index = 0; index < samples.length - 1; index += 1) {
    result.push(...outsideEndpointDisks(samples[index] as Point, samples[index + 1] as Point, shared, radius));
  }
  return result;
}

export function analyzeRoutePair(
  first: AnnularRouteCandidate,
  second: AnnularRouteCandidate,
  commonEndpointRadius = 18,
  approximationTolerance = 0,
): RoutePairDiagnostic {
  if (!Number.isFinite(commonEndpointRadius) || commonEndpointRadius < 0 || !Number.isFinite(approximationTolerance) || approximationTolerance < 0) throw new RangeError("endpoint radius and approximation tolerance must be finite and nonnegative");
  const labels = sharedLabels(first, second);
  const sharedPoints = labels.map((label) => {
    if (label === first.edge.startLabel) return first.samples[0] as Point;
    return first.samples[first.samples.length - 1] as Point;
  });
  let clearance = Number.POSITIVE_INFINITY;
  let intersects = false;
  let coincidentSegments = 0;

  const contractedEndpointRadius = Math.max(0, commonEndpointRadius - approximationTolerance);
  const firstSegments = clippedRouteSegments(first.samples, sharedPoints, contractedEndpointRadius);
  const secondSegments = clippedRouteSegments(second.samples, sharedPoints, contractedEndpointRadius);
  if (labels.length > 0 && commonEndpointRadius > 8) {
    const tightRadius = Math.max(0, 8 - approximationTolerance);
    const tightFirst = clippedRouteSegments(first.samples, sharedPoints, tightRadius);
    const tightSecond = clippedRouteSegments(second.samples, sharedPoints, tightRadius);
    for (const [firstStart, firstEnd] of tightFirst) for (const [secondStart, secondEnd] of tightSecond) {
      if (boxesFar(firstStart, firstEnd, secondStart, secondEnd, 2 * approximationTolerance)) continue;
      if (segmentDistance(firstStart, firstEnd, secondStart, secondEnd) <= 2 * approximationTolerance) intersects = true;
    }
  }
  for (const [firstStart, firstEnd] of firstSegments) {
    for (const [secondStart, secondEnd] of secondSegments) {
      if (Number.isFinite(clearance) && boxesFar(firstStart, firstEnd, secondStart, secondEnd, Math.max(clearance, 0.2))) continue;
      const distance = segmentDistance(firstStart, firstEnd, secondStart, secondEnd);
      clearance = Math.min(clearance, distance);
      if (distance === 0) intersects = true;
      if (distance <= 0.2 && Math.abs(cross(firstStart, firstEnd, secondStart)) < 0.5 && Math.abs(cross(firstStart, firstEnd, secondEnd)) < 0.5) {
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
  const firstSegments = clippedRouteSegments(first.samples, sharedPoints, commonEndpointRadius);
  const secondSegments = clippedRouteSegments(second.samples, sharedPoints, commonEndpointRadius);
  if (labels.length > 0 && commonEndpointRadius > 8) {
    const tightFirst = clippedRouteSegments(first.samples, sharedPoints, 8);
    const tightSecond = clippedRouteSegments(second.samples, sharedPoints, 8);
    for (const [firstStart, firstEnd] of tightFirst) for (const [secondStart, secondEnd] of tightSecond) {
      if (segmentDistance(firstStart, firstEnd, secondStart, secondEnd) <= 0) return true;
    }
  }
  for (const [firstStart, firstEnd] of firstSegments) {
    for (const [secondStart, secondEnd] of secondSegments) {
      if (boxesFar(firstStart, firstEnd, secondStart, secondEnd, hardClearance)) continue;
      const distance = segmentDistance(firstStart, firstEnd, secondStart, secondEnd);
      if (distance < hardClearance) return true;
      if (distance <= 0.2 && Math.abs(cross(firstStart, firstEnd, secondStart)) < 0.5 && Math.abs(cross(firstStart, firstEnd, secondEnd)) < 0.5) {
        coincidentSegments += 1;
        if (coincidentSegments >= 2) return true;
      }
    }
  }
  return false;
}
