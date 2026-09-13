import { segmentDistance } from "./annular-routing/intersections";
import {
  DISC_CENTER,
  DISC_CONTROL_CHORD_PROGRESS,
  DISC_RADIUS,
  DISC_TWO_CYCLE_MIN_LANE_GAP,
  DISC_TWO_CYCLE_LANE_GAP,
  createDiscArcFromControls,
  createDiscLayout,
  makeDiscArc,
  preferredTwoCycleLaneGap,
  sampleDiscArc,
  type ArcGeometry,
  type DirectedEdge,
  type DiscLayout,
  type Point,
  type Vertex,
} from "./disc";
import type { DiagramModel } from "./types";

export const DISC_EDIT_APPROXIMATION_TOLERANCE = 0.12;
export const DISC_EDIT_COMMON_ENDPOINT_RADIUS = 18;
export const DISC_EDIT_TIGHT_ENDPOINT_RADIUS = 8;
export const DISC_EDIT_MAX_SEGMENTS = 512;
// Covers the default 3.4-unit stroke plus a visible centreline gap. The
// line-weight control may deliberately make already-admitted geometry heavier;
// route editing itself never admits sub-pixel near contacts.
export const DISC_EDIT_HARD_CLEARANCE = 4;

const MIN_SINGLETON_AREA = 36;
const MIN_SINGLETON_DIAMETER = 8;

export interface DiscCubicControlEdit {
  readonly control1: Point;
  readonly control2: Point;
}

export interface DiscRoutedEdge {
  readonly edge: DirectedEdge;
  readonly start: Vertex;
  readonly end: Vertex;
  readonly geometry: ArcGeometry;
  /** A polyline whose interpolation error is analytically bounded. */
  readonly samples: readonly Point[];
  readonly approximationError: number;
  /** Minimum midpoint separation retained by manual two-cycle edits. */
  readonly minimumLaneGap: number;
}

export interface DiscGeometryState {
  readonly model: DiagramModel;
  readonly layout: DiscLayout;
  readonly routes: readonly DiscRoutedEdge[];
  readonly manualEditCount: number;
  /** True when certification required lanes/loops too small for ordinary viewing. */
  readonly compactPresentation?: boolean;
}

const verifiedDiscStates = new WeakSet<DiscGeometryState>();

export function isVerifiedDiscGeometryState(state: DiscGeometryState): boolean {
  return verifiedDiscStates.has(state);
}

export type DiscRouteEditResult =
  | { readonly ok: true; readonly state: DiscGeometryState }
  | {
    readonly ok: false;
    readonly reason: "not-editable" | "invalid-controls" | "self-intersection" | "collision" | "verification-failed";
  };

function finitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function distance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function insideDisc(point: Point): boolean {
  return finitePoint(point) && distance(point, DISC_CENTER) <= DISC_RADIUS - 0.5;
}

function insideClosedDisc(point: Point): boolean {
  return finitePoint(point) && distance(point, DISC_CENTER) <= DISC_RADIUS + 1e-8;
}

function secondDerivativeBound(start: Point, control1: Point, control2: Point, end: Point): number {
  const first = {
    x: start.x - 2 * control1.x + control2.x,
    y: start.y - 2 * control1.y + control2.y,
  };
  const second = {
    x: control1.x - 2 * control2.x + end.x,
    y: control1.y - 2 * control2.y + end.y,
  };
  return 6 * Math.max(Math.hypot(first.x, first.y), Math.hypot(second.x, second.y));
}

/**
 * A cubic's distance from the chord of a parameter interval is at most
 * M·Δt²/8. Uniform subdivision therefore gives a small, deterministic proof
 * object without trusting empirical quarter-point sampling.
 */
function isStraightLocus(start: Point, end: Point, geometry: ArcGeometry): boolean {
  const chord = { x: end.x - start.x, y: end.y - start.y };
  const chordLengthSquared = chord.x * chord.x + chord.y * chord.y;
  if (chordLengthSquared <= 1e-16) return false;
  const controls = [geometry.control1, geometry.control2];
  return controls.every((control) => {
    const relative = { x: control.x - start.x, y: control.y - start.y };
    const cross = chord.x * relative.y - chord.y * relative.x;
    const projection = chord.x * relative.x + chord.y * relative.y;
    return Math.abs(cross) <= 1e-8 * Math.sqrt(chordLengthSquared)
      && projection >= -1e-8
      && projection <= chordLengthSquared + 1e-8;
  });
}

interface CertifiedPolyline {
  readonly samples: readonly Point[];
  readonly approximationError: number;
}

function certifiedSamples(
  start: Point,
  end: Point,
  geometry: ArcGeometry,
  tolerance = DISC_EDIT_APPROXIMATION_TOLERANCE,
): CertifiedPolyline | null {
  if (isStraightLocus(start, end, geometry)) {
    return Object.freeze({ samples: Object.freeze([start, end]), approximationError: 0 });
  }
  const bound = secondDerivativeBound(start, geometry.control1, geometry.control2, end);
  if (!Number.isFinite(bound)) return null;
  const segmentCount = Math.max(4, Math.ceil(Math.sqrt(bound / (8 * tolerance))));
  if (segmentCount > DISC_EDIT_MAX_SEGMENTS) return null;
  const samples = sampleDiscArc(start, end, geometry, segmentCount + 1);
  if (!samples.every(finitePoint)) return null;
  return Object.freeze({
    samples,
    approximationError: bound / (8 * segmentCount * segmentCount),
  });
}

function freezeModel(model: DiagramModel): DiagramModel {
  return Object.freeze({
    notation: model.notation,
    vertexCount: model.vertexCount,
    cycles: Object.freeze(model.cycles.map((cycle) => Object.freeze([...cycle]))),
  });
}

function freezeLayout(layout: DiscLayout): DiscLayout {
  return Object.freeze({
    vertices: Object.freeze(layout.vertices.map((vertex) => Object.freeze({
      ...vertex,
      labelPosition: Object.freeze({ ...vertex.labelPosition }),
    }))),
    edges: Object.freeze(layout.edges.map((edge) => Object.freeze({ ...edge }))),
  });
}

interface BaselineStyle {
  readonly curvatureScale: number;
  readonly laneGapScale: number;
  readonly singletonScale: number;
}

// Style is backed off only for a cycle involved in a failed certificate. This
// preserves broad, unrelated ribbons instead of flattening the whole diagram.
const BASELINE_CURVATURE_LEVELS = Object.freeze([1, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25, 0.125, 0]);
const BASELINE_SINGLETON_LEVELS = Object.freeze([1, 0.75, 0.5, 0.25, 0.12, 0.06, 0.03, 0.01, 0.003]);

function maximumStyleLevel(cycleLength: number): number {
  return cycleLength === 1 ? BASELINE_SINGLETON_LEVELS.length - 1 : BASELINE_CURVATURE_LEVELS.length - 1;
}

function baselineStyle(cycleLength: number, level: number): BaselineStyle {
  if (cycleLength === 1) {
    return { curvatureScale: 1, laneGapScale: 1, singletonScale: BASELINE_SINGLETON_LEVELS[level] ?? 0.03 };
  }
  const curvatureScale = BASELINE_CURVATURE_LEVELS[level] ?? 0;
  return { curvatureScale, laneGapScale: curvatureScale, singletonScale: 1 };
}

function candidateRoutes(
  model: DiagramModel,
  layout: DiscLayout,
  cycleStyleLevels: readonly number[],
  scaffoldFallback?: { readonly laneScale: number; readonly singletonScale: number },
): readonly DiscRoutedEdge[] | null {
  const vertexById = new Map(layout.vertices.map((vertex) => [vertex.id, vertex]));
  const routes = layout.edges.map((edge) => {
    const start = vertexById.get(edge.start);
    const end = vertexById.get(edge.end);
    if (!start || !end) throw new Error(`Missing endpoint for edge ${edge.id}`);
    const style = baselineStyle(edge.cycle.length, cycleStyleLevels[edge.cycleIndex] ?? 0);
    const preferredGap = preferredTwoCycleLaneGap(start, end);
    const scaffoldLaneGap = Math.max(
      0.001,
      Math.min(0.25, distance(start, end) * 0.0015) * (scaffoldFallback?.laneScale ?? 1),
    );
    const geometry = makeDiscArc(start, end, edge, model.vertexCount, {
      curvatureScale: scaffoldFallback ? 0 : style.curvatureScale,
      singletonScale: scaffoldFallback?.singletonScale ?? style.singletonScale,
      twoCycleLaneGap: scaffoldFallback ? scaffoldLaneGap : (
        DISC_TWO_CYCLE_MIN_LANE_GAP
          + (preferredGap - DISC_TWO_CYCLE_MIN_LANE_GAP) * style.laneGapScale
      ),
      chordProgress: scaffoldFallback ? 1 / 3 : DISC_CONTROL_CHORD_PROGRESS,
    });
    const certificate = certifiedSamples(start, end, geometry);
    if (!certificate) return null;
    return Object.freeze({
      edge,
      start,
      end,
      geometry,
      samples: certificate.samples,
      approximationError: certificate.approximationError,
      minimumLaneGap: edge.cycle.length === 2
        ? (scaffoldFallback ? scaffoldLaneGap : DISC_TWO_CYCLE_MIN_LANE_GAP)
        : 0,
    });
  });
  return routes.some((route) => route === null)
    ? null
    : Object.freeze(routes as readonly DiscRoutedEdge[]);
}

export function createDiscGeometryState(inputModel: DiagramModel): DiscGeometryState {
  const model = freezeModel(inputModel);
  const layout = freezeLayout(createDiscLayout(model));
  let levels = model.cycles.map(() => 0);
  let routes = candidateRoutes(model, layout, levels);
  let lastFailure: RouteSetFailure | null = null;
  // Always certify the visible candidate once. At large support, repeated
  // whole-layout style trials are too costly; proceed directly to the bounded
  // compact fallback if that first candidate fails.
  const maximumBackoffs = layout.edges.length > 64
    ? 0
    : Math.min(24, model.cycles.reduce((total, cycle) => total + maximumStyleLevel(cycle.length), 0));

  for (let attempt = 0; attempt <= maximumBackoffs; attempt += 1) {
    if (!routes) break;
    const failure = routeSetFailure(routes);
    if (!failure) {
      const frozenRoutes = routes;
      const state = Object.freeze({ model, layout, routes: frozenRoutes, manualEditCount: 0 });
      verifiedDiscStates.add(state);
      return state;
    }
    lastFailure = failure;
    if (attempt >= maximumBackoffs) break;
    const involvedCycles = [...new Set(failure.routes.map((route) => route.edge.cycleIndex))]
      .filter((cycleIndex) => levels[cycleIndex]! < maximumStyleLevel(model.cycles[cycleIndex]?.length ?? 0));
    if (involvedCycles.length === 0) break;

    if (failure.routes.every((route) => route.edge.role === "singleton")) {
      const nextLevels = levels.map((level, cycleIndex) => model.cycles[cycleIndex]?.length === 1
        ? Math.min(level + 1, maximumStyleLevel(1))
        : level);
      const nextRoutes = candidateRoutes(model, layout, nextLevels);
      if (!nextRoutes) break;
      levels = nextLevels;
      routes = nextRoutes;
      continue;
    }

    let best: { readonly levels: number[]; readonly routes: readonly DiscRoutedEdge[]; readonly failure: RouteSetFailure | null; readonly score: number } | null = null;
    for (const cycleIndex of involvedCycles) {
      const nextLevels = [...levels];
      nextLevels[cycleIndex] = (nextLevels[cycleIndex] ?? 0) + 1;
      const nextRoutes = candidateRoutes(model, layout, nextLevels);
      if (!nextRoutes) continue;
      const nextFailure = routeSetFailure(nextRoutes);
      if (!nextFailure) {
        const state = Object.freeze({ model, layout, routes: nextRoutes, manualEditCount: 0 });
        verifiedDiscStates.add(state);
        return state;
      }
      const sameFailure = routeSetFailureKey(nextFailure) === routeSetFailureKey(failure);
      const score = (sameFailure ? 1_000 : 0) + (nextLevels[cycleIndex] ?? 0);
      if (!best || score < best.score) best = { levels: nextLevels, routes: nextRoutes, failure: nextFailure, score };
    }
    if (!best) break;
    levels = best.levels;
    routes = best.routes;
    lastFailure = best.failure;
  }
  // A noncrossing partition's straight polygon scaffold is an embedding. Use
  // proof-friendly, geometrically shrinking transposition lanes and shrinking
  // boundary loops for singletons until that scaffold itself certifies. This
  // fallback is intentionally independent of edge order and never copies the
  // old renderer's privileged closing edge.
  for (let fallbackLevel = 0; fallbackLevel <= 14; fallbackLevel += 1) {
    const laneScale = 0.5 ** fallbackLevel;
    const singletonScale = Math.max(0.00001, 0.001 * laneScale);
    const fallbackRoutes = candidateRoutes(model, layout, levels, { laneScale, singletonScale });
    if (!fallbackRoutes) continue;
    const failure = routeSetFailure(fallbackRoutes);
    if (!failure) {
      const state = Object.freeze({ model, layout, routes: fallbackRoutes, manualEditCount: 0, compactPresentation: true });
      verifiedDiscStates.add(state);
      return state;
    }
    lastFailure = failure;
  }
  throw new Error(`No disc curve style satisfied the fixed production verifier (${lastFailure?.reason ?? "candidate construction failed"})`);
}

type Segment = readonly [Point, Point];
const polylineSegmentCache = new WeakMap<readonly Point[], readonly Segment[]>();

function interpolate(start: Point, end: Point, t: number): Point {
  return Object.freeze({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t });
}

/** Return the portions of a segment outside every legitimate shared-anchor disk. */
function outsideEndpointDisks(start: Point, end: Point, centers: readonly Point[], radius: number): readonly Segment[] {
  if (centers.length === 0 || radius <= 0) return Object.freeze([[start, end] as const]);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const a = dx * dx + dy * dy;
  if (a === 0) return centers.some((center) => distance(start, center) < radius)
    ? Object.freeze([])
    : Object.freeze([[start, end] as const]);
  let intervals: Array<readonly [number, number]> = [[0, 1]];
  for (const center of centers) {
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

function clippedSegments(samples: readonly Point[], centers: readonly Point[], radius: number): readonly Segment[] {
  if (centers.length === 0 || radius <= 0) {
    const cached = polylineSegmentCache.get(samples);
    if (cached) return cached;
    const segments = Object.freeze(Array.from({ length: Math.max(0, samples.length - 1) }, (_, index) => (
      Object.freeze([samples[index] as Point, samples[index + 1] as Point] as const)
    )));
    polylineSegmentCache.set(samples, segments);
    return segments;
  }
  const result: Segment[] = [];
  for (let index = 0; index < samples.length - 1; index += 1) {
    result.push(...outsideEndpointDisks(samples[index] as Point, samples[index + 1] as Point, centers, radius));
  }
  return Object.freeze(result);
}

function sharedAnchors(first: DiscRoutedEdge, second: DiscRoutedEdge): readonly Point[] {
  const sharedLabels = [...new Set([first.edge.start, first.edge.end]
    .filter((label) => label === second.edge.start || label === second.edge.end))];
  return Object.freeze(sharedLabels.map((label) => first.edge.start === label ? first.start : first.end));
}

interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

const sampleBoundsCache = new WeakMap<readonly Point[], Bounds>();
function sampleBounds(samples: readonly Point[]): Bounds {
  const cached = sampleBoundsCache.get(samples);
  if (cached) return cached;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of samples) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  }
  const bounds = Object.freeze({ minX, maxX, minY, maxY });
  sampleBoundsCache.set(samples, bounds);
  return bounds;
}

function boxesFar(first: Bounds, second: Bounds, margin: number): boolean {
  return first.maxX + margin < second.minX || second.maxX + margin < first.minX
    || first.maxY + margin < second.minY || second.maxY + margin < first.minY;
}

function segmentBounds(start: Point, end: Point): Bounds {
  return {
    minX: Math.min(start.x, end.x), maxX: Math.max(start.x, end.x),
    minY: Math.min(start.y, end.y), maxY: Math.max(start.y, end.y),
  };
}

function segmentsConflict(
  firstSegments: readonly Segment[],
  secondSegments: readonly Segment[],
  clearance: number,
): boolean {
  for (const [a, b] of firstSegments) {
    const firstBounds = segmentBounds(a, b);
    for (const [c, d] of secondSegments) {
      if (boxesFar(firstBounds, segmentBounds(c, d), clearance)) continue;
      if (segmentDistance(a, b, c, d) <= clearance) return true;
    }
  }
  return false;
}

type CubicControls = readonly [Point, Point, Point, Point];

function splitCubic(controls: CubicControls, t: number): readonly [CubicControls, CubicControls] {
  const [p0, p1, p2, p3] = controls;
  const p01 = interpolate(p0, p1, t);
  const p12 = interpolate(p1, p2, t);
  const p23 = interpolate(p2, p3, t);
  const p012 = interpolate(p01, p12, t);
  const p123 = interpolate(p12, p23, t);
  const midpoint = interpolate(p012, p123, t);
  return [
    Object.freeze([p0, p01, p012, midpoint]),
    Object.freeze([midpoint, p123, p23, p3]),
  ];
}

function endpointPrefix(route: DiscRoutedEdge, anchor: Point): CubicControls {
  const forward = distance(route.start, anchor) <= 1e-8;
  const controls: CubicControls = forward
    ? [route.start, route.geometry.control1, route.geometry.control2, route.end]
    : [route.end, route.geometry.control2, route.geometry.control1, route.start];
  let parameter = 1 / 1024;
  let prefix = splitCubic(controls, parameter)[0];
  while (parameter < 1 && distance(prefix[3], anchor) < DISC_EDIT_TIGHT_ENDPOINT_RADIUS) {
    parameter = Math.min(1, parameter * 2);
    prefix = splitCubic(controls, parameter)[0];
  }
  return prefix;
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function convexHull(points: readonly Point[]): readonly Point[] {
  const sorted = [...points]
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .filter((point, index, values) => index === 0 || distance(point, values[index - 1] as Point) > 1e-10);
  if (sorted.length <= 2) return Object.freeze(sorted);
  const half = (values: readonly Point[]) => {
    const hull: Point[] = [];
    for (const point of values) {
      while (hull.length >= 2 && orientation(hull[hull.length - 2] as Point, hull[hull.length - 1] as Point, point) <= 1e-12) hull.pop();
      hull.push(point);
    }
    return hull;
  };
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return Object.freeze([...lower.slice(0, -1), ...upper.slice(0, -1)]);
}

function pointOnSegment(point: Point, start: Point, end: Point): boolean {
  return Math.abs(orientation(start, end, point)) <= 1e-9
    && point.x >= Math.min(start.x, end.x) - 1e-9 && point.x <= Math.max(start.x, end.x) + 1e-9
    && point.y >= Math.min(start.y, end.y) - 1e-9 && point.y <= Math.max(start.y, end.y) + 1e-9;
}

function segmentsMeetBeyondAnchor(a: Point, b: Point, c: Point, d: Point, anchor: Point): boolean {
  if (segmentDistance(a, b, c, d) > 1e-9) return false;
  return [a, b].some((point) => distance(point, anchor) > 1e-8 && pointOnSegment(point, c, d))
    || [c, d].some((point) => distance(point, anchor) > 1e-8 && pointOnSegment(point, a, b))
    || (orientation(a, b, c) * orientation(a, b, d) < 0
      && orientation(c, d, a) * orientation(c, d, b) < 0);
}

function pointInsideConvexHull(point: Point, hull: readonly Point[]): boolean {
  if (hull.length < 3) return false;
  let sign = 0;
  for (let index = 0; index < hull.length; index += 1) {
    const value = orientation(hull[index] as Point, hull[(index + 1) % hull.length] as Point, point);
    if (Math.abs(value) <= 1e-9) continue;
    if (sign === 0) sign = Math.sign(value);
    else if (Math.sign(value) !== sign) return false;
  }
  return true;
}

function endpointHullsOverlap(first: DiscRoutedEdge, second: DiscRoutedEdge, anchor: Point): boolean {
  const firstHull = convexHull(endpointPrefix(first, anchor));
  const secondHull = convexHull(endpointPrefix(second, anchor));
  for (let a = 0; a < firstHull.length; a += 1) {
    const aStart = firstHull[a] as Point;
    const aEnd = firstHull[(a + 1) % firstHull.length] as Point;
    for (let b = 0; b < secondHull.length; b += 1) {
      if (segmentsMeetBeyondAnchor(
        aStart,
        aEnd,
        secondHull[b] as Point,
        secondHull[(b + 1) % secondHull.length] as Point,
        anchor,
      )) return true;
    }
  }
  return firstHull.some((point) => distance(point, anchor) > 1e-8 && pointInsideConvexHull(point, secondHull))
    || secondHull.some((point) => distance(point, anchor) > 1e-8 && pointInsideConvexHull(point, firstHull));
}

function twoCyclePartnerSeparationProved(first: DiscRoutedEdge, second: DiscRoutedEdge): boolean {
  if (first.edge.cycleIndex !== second.edge.cycleIndex
    || first.edge.cycle.length !== 2 || second.edge.cycle.length !== 2) return false;
  const low = first.start.id < first.end.id ? first.start : first.end;
  const high = first.start.id < first.end.id ? first.end : first.start;
  const chord = { x: high.x - low.x, y: high.y - low.y };
  const length = Math.hypot(chord.x, chord.y);
  if (length <= 1e-9) return false;
  const tangent = { x: chord.x / length, y: chord.y / length };
  const normal = { x: -tangent.y, y: tangent.x };
  const alignedControls = (route: DiscRoutedEdge): readonly [Point, Point] => (
    route.start.id < route.end.id
      ? [route.geometry.control1, route.geometry.control2]
      : [route.geometry.control2, route.geometry.control1]
  );
  const [first1, first2] = alignedControls(first);
  const [second1, second2] = alignedControls(second);
  const projection = (point: Point, axis: Point) => point.x * axis.x + point.y * axis.y;
  const lowProjection = projection(low, tangent);
  const highProjection = projection(high, tangent);
  const control1Projection = projection(first1, tangent);
  const control2Projection = projection(first2, tangent);
  if (Math.abs(projection(first1, tangent) - projection(second1, tangent)) > 1e-8
    || Math.abs(projection(first2, tangent) - projection(second2, tangent)) > 1e-8
    || control1Projection < lowProjection || control1Projection > control2Projection
    || control2Projection > highProjection) return false;
  const firstDifference = projection({ x: first1.x - second1.x, y: first1.y - second1.y }, normal);
  const secondDifference = projection({ x: first2.x - second2.x, y: first2.y - second2.y }, normal);
  // With identical monotone chord coordinates, an intersection has the same
  // parameter on both cubics. Positive Bernstein weights keep a same-signed,
  // nonzero normal control difference from vanishing in the open interval.
  return firstDifference * secondDifference >= 0
    && (Math.abs(firstDifference) > 1e-8 || Math.abs(secondDifference) > 1e-8);
}

function polylinesConflict(first: DiscRoutedEdge, second: DiscRoutedEdge): boolean {
  const shared = sharedAnchors(first, second);
  if (shared.length === 2 && twoCyclePartnerSeparationProved(first, second)) return false;
  const toleranceMargin = first.approximationError + second.approximationError;
  const requiresHardClearance = first.edge.cycleIndex !== second.edge.cycleIndex
    || shared.length === 0;
  // At very dense support, a boundary vertex can be closer than four units to
  // a mathematically noncrossing chord that encloses it. Preserve a fixed
  // fraction of that straight-scaffold clearance instead of making valid
  // n<=400 inputs impossible, while retaining the full visible-stroke
  // clearance whenever the combinatorial embedding has room.
  const scaffoldClearance = segmentDistance(first.start, first.end, second.start, second.end);
  const hardClearance = Math.min(DISC_EDIT_HARD_CLEARANCE, scaffoldClearance * 0.75);
  const broadMargin = requiresHardClearance ? hardClearance + toleranceMargin : toleranceMargin;
  if (boxesFar(sampleBounds(first.samples), sampleBounds(second.samples), broadMargin)) {
    return false;
  }
  if (shared.length > 0) {
    // Each endpoint prefix is contained by its exact cubic control hull. Two
    // hulls that meet only at their pinned anchor prove that the curves fan out
    // without a hidden local fold; the sampled clearance proof takes over once
    // the prefixes reach the ordinary eight-unit endpoint boundary.
    if (shared.some((anchor) => endpointHullsOverlap(first, second, anchor))) return true;
  }
  if (requiresHardClearance) {
    const contractedRadius = Math.max(0, DISC_EDIT_COMMON_ENDPOINT_RADIUS - toleranceMargin);
    const firstSegments = clippedSegments(first.samples, shared, contractedRadius);
    const secondSegments = clippedSegments(second.samples, shared, contractedRadius);
    if (segmentsConflict(firstSegments, secondSegments, hardClearance + toleranceMargin)) return true;
  }
  if (shared.length > 0) {
    const tightRadius = Math.max(0, DISC_EDIT_TIGHT_ENDPOINT_RADIUS - toleranceMargin);
    const tightFirst = clippedSegments(first.samples, shared, tightRadius);
    const tightSecond = clippedSegments(second.samples, shared, tightRadius);
    if (segmentsConflict(tightFirst, tightSecond, toleranceMargin)) return true;
  }
  return false;
}

function polylineHasSelfContact(samples: readonly Point[], closed: boolean, approximationError: number): boolean {
  const segmentCount = samples.length - 1;
  const margin = 2 * approximationError;
  for (let first = 0; first < segmentCount; first += 1) {
    for (let second = first + 1; second < segmentCount; second += 1) {
      const directSeparation = second - first;
      const topologicalSeparation = closed
        ? Math.min(directSeparation, segmentCount - directSeparation)
        : directSeparation;
      if (topologicalSeparation <= 1) continue;
      const a = samples[first] as Point;
      const b = samples[first + 1] as Point;
      const c = samples[second] as Point;
      const d = samples[second + 1] as Point;
      const clearance = segmentDistance(a, b, c, d);
      if (clearance === 0) return true;
      if (topologicalSeparation >= 3
        && !boxesFar(segmentBounds(a, b), segmentBounds(c, d), margin)
        && clearance <= margin) return true;
    }
  }
  return false;
}

interface RouteSetFailure {
  readonly reason: string;
  readonly routes: readonly DiscRoutedEdge[];
}

function routeSetFailureKey(failure: RouteSetFailure): string {
  return failure.routes.map((route) => route.edge.id).sort().join("|");
}

function routeSetFailure(routes: readonly DiscRoutedEdge[]): RouteSetFailure | null {
  for (const route of routes) {
    if (!insideClosedDisc(route.geometry.control1) || !insideClosedDisc(route.geometry.control2)) {
      return { reason: `${route.edge.id} leaves disc`, routes: [route] };
    }
    if (polylineHasSelfContact(route.samples, route.edge.role === "singleton", route.approximationError)) {
      return { reason: `${route.edge.id} self-contact`, routes: [route] };
    }
  }
  for (const route of routes) {
    if (route.edge.cycle.length !== 2 || route.edge.start > route.edge.end) continue;
    const partner = routes.find((candidate) => candidate.edge.cycleIndex === route.edge.cycleIndex && candidate.edge.id !== route.edge.id);
    const firstMidpoint = sampleDiscArc(route.start, route.end, route.geometry, 3)[1];
    const secondMidpoint = partner ? sampleDiscArc(partner.start, partner.end, partner.geometry, 3)[1] : undefined;
    if (!partner || !firstMidpoint || !secondMidpoint
      || distance(firstMidpoint, secondMidpoint) + 1e-8 < Math.max(route.minimumLaneGap, partner?.minimumLaneGap ?? 0)) {
      return { reason: `${route.edge.id} has no distinct partner lane`, routes: partner ? [route, partner] : [route] };
    }
  }
  for (let first = 0; first < routes.length; first += 1) {
    for (let second = first + 1; second < routes.length; second += 1) {
      const a = routes[first]; const b = routes[second];
      if (a && b && polylinesConflict(a, b)) {
        return { reason: `${a.edge.id} conflicts ${b.edge.id}`, routes: [a, b] };
      }
    }
  }
  return null;
}

function signedArea(samples: readonly Point[]): number {
  let twiceArea = 0;
  for (let index = 0; index < samples.length - 1; index += 1) {
    const current = samples[index] as Point;
    const next = samples[index + 1] as Point;
    twiceArea += current.x * next.y - current.y * next.x;
  }
  return twiceArea / 2;
}

function singletonIsVisible(samples: readonly Point[]): boolean {
  let diameter = 0;
  for (let first = 0; first < samples.length; first += 1) {
    for (let second = first + 1; second < samples.length; second += 1) {
      diameter = Math.max(diameter, distance(samples[first] as Point, samples[second] as Point));
    }
  }
  return diameter >= MIN_SINGLETON_DIAMETER && Math.abs(signedArea(samples)) >= MIN_SINGLETON_AREA;
}

/**
 * Admit one true cubic only after a bounded analytical approximation proves it
 * finite, contained by the convex disc, simple, and disjoint from every other
 * currently admitted route outside contracted common-anchor exemptions.
 */
export function verifyDiscRouteControlEdit(
  state: DiscGeometryState,
  edgeId: string,
  controls: DiscCubicControlEdit,
): DiscRouteEditResult {
  if (!verifiedDiscStates.has(state)) return Object.freeze({ ok: false, reason: "verification-failed" as const });
  const routeIndex = state.routes.findIndex((route) => route.edge.id === edgeId);
  const current = state.routes[routeIndex];
  if (!current) return Object.freeze({ ok: false, reason: "not-editable" as const });
  if (controls.control1.x === current.geometry.control1.x
    && controls.control1.y === current.geometry.control1.y
    && controls.control2.x === current.geometry.control2.x
    && controls.control2.y === current.geometry.control2.y) {
    return Object.freeze({ ok: true, state });
  }
  if (!insideDisc(controls.control1) || !insideDisc(controls.control2)) {
    return Object.freeze({ ok: false, reason: "invalid-controls" as const });
  }
  const geometry = createDiscArcFromControls(
    current.start,
    current.end,
    controls.control1,
    controls.control2,
    current.geometry.depth,
  );
  const certificate = certifiedSamples(current.start, current.end, geometry);
  if (!certificate) return Object.freeze({ ok: false, reason: "verification-failed" as const });
  const { samples, approximationError } = certificate;
  const closed = current.edge.role === "singleton";
  if (polylineHasSelfContact(samples, closed, approximationError) || (closed && !singletonIsVisible(samples))) {
    return Object.freeze({ ok: false, reason: "self-intersection" as const });
  }
  const edited = Object.freeze({ ...current, geometry, samples, approximationError });
  if (current.edge.cycle.length === 2) {
    const partner = state.routes.find((route) => route.edge.cycleIndex === current.edge.cycleIndex && route.edge.id !== current.edge.id);
    if (!partner) return Object.freeze({ ok: false, reason: "verification-failed" as const });
    const editedMidpoint = sampleDiscArc(current.start, current.end, geometry, 3)[1];
    const partnerMidpoint = sampleDiscArc(partner.start, partner.end, partner.geometry, 3)[1];
    if (!editedMidpoint || !partnerMidpoint
      || distance(editedMidpoint, partnerMidpoint) < Math.max(current.minimumLaneGap, partner.minimumLaneGap)) {
      return Object.freeze({ ok: false, reason: "collision" as const });
    }
  }
  for (let index = 0; index < state.routes.length; index += 1) {
    if (index === routeIndex) continue;
    const other = state.routes[index];
    if (other && polylinesConflict(edited, other)) {
      return Object.freeze({ ok: false, reason: "collision" as const });
    }
  }
  const routes = Object.freeze(state.routes.map((route, index) => index === routeIndex ? edited : route));
  const nextState = Object.freeze({ ...state, routes, manualEditCount: state.manualEditCount + 1 });
  verifiedDiscStates.add(nextState);
  return Object.freeze({
    ok: true,
    state: nextState,
  });
}
