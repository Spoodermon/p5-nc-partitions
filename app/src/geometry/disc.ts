import type { DiagramModel, RenderCycle } from "./types";

export const VIEWBOX_SIZE = 1000;
export const DISC_CENTER = { x: 500, y: 500 } as const;
export const DISC_RADIUS = 370;
// A geometry-level separation contract for the two directed sides of a
// transposition ribbon. Responsive SVG scaling may change its on-screen size.
export const DISC_TWO_CYCLE_LANE_GAP = 36;
// A verified layout may contract a ribbon when the preferred gap would collide
// with another block. This preferred-style floor keeps its directed lanes
// visibly distinct; the exact scaffold fallback has its own local gap proof.
export const DISC_TWO_CYCLE_MIN_LANE_GAP = 4;
const DISC_TWO_CYCLE_ABSOLUTE_MIN_LANE_GAP = 0.001;
// A span-based radial depth inspired by the older visual grammar. The older
// implementation made the list-closing edge dramatically deeper; here the
// geometric boundary span alone determines depth, so rotating cycle notation
// cannot introduce a visual seam.
export const DISC_ADJACENT_CONTROL_RADIUS_RATIO = 0.72;
export const DISC_MIN_CONTROL_RADIUS_RATIO = 0.48;
export const DISC_CONTROL_RADIUS_STEP_PER_SPAN = 0.24;
export const DISC_TWO_CYCLE_CONTROL_RADIUS_RATIO = 0.68;
export const DISC_SINGLETON_CONTROL_RADIUS_RATIO = 0.8;
const DISC_TWO_CYCLE_MAX_LANE_GAP = 140;
const DISC_TWO_CYCLE_CHORD_GAP_RATIO = 0.32;
export const DISC_CONTROL_CHORD_PROGRESS = 0.16;

export interface DiscArcStyle {
  /** Interpolates the preferred curved grammar toward its straight chord. */
  readonly curvatureScale?: number;
  /** Requested midpoint separation for the two sides of a transposition. */
  readonly twoCycleLaneGap?: number;
  /** Interpolates singleton handles toward their pinned boundary anchor. */
  readonly singletonScale?: number;
  /** Proof-oriented scaffold fallback uses 1/3; visual candidates use 0.16. */
  readonly chordProgress?: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Vertex extends Point {
  readonly id: number;
  readonly angle: number;
  readonly labelPosition: Point;
}

export type EdgeRole = "forward" | "return" | "singleton";

export interface DirectedEdge {
  readonly id: string;
  readonly cycleIndex: number;
  readonly cycle: RenderCycle;
  readonly start: number;
  readonly end: number;
  readonly role: EdgeRole;
  readonly lane: number;
}

export interface ArcGeometry {
  readonly path: string;
  readonly depth: number;
  readonly control1: Point;
  readonly control2: Point;
}

export interface DiscLayout {
  readonly vertices: readonly Vertex[];
  readonly edges: readonly DirectedEdge[];
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(point: Point, amount: number): Point {
  return { x: point.x * amount, y: point.y * amount };
}

function magnitude(point: Point): number {
  return Math.hypot(point.x, point.y);
}

function normalize(point: Point): Point {
  const length = magnitude(point);
  return length > 1e-9 ? scale(point, 1 / length) : { x: 0, y: 0 };
}

function midpoint(a: Point, b: Point): Point {
  return scale(add(a, b), 0.5);
}

function format(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function cubicPathThroughMidpoint(start: Point, control1: Point, control2: Point, end: Point): string {
  const startToControl = midpoint(start, control1);
  const betweenControls = midpoint(control1, control2);
  const controlToEnd = midpoint(control2, end);
  const leftControl = midpoint(startToControl, betweenControls);
  const rightControl = midpoint(betweenControls, controlToEnd);
  const curveMidpoint = midpoint(leftControl, rightControl);

  return [
    `M ${format(start.x)} ${format(start.y)}`,
    `C ${format(startToControl.x)} ${format(startToControl.y)}`,
    `${format(leftControl.x)} ${format(leftControl.y)}`,
    `${format(curveMidpoint.x)} ${format(curveMidpoint.y)}`,
    `C ${format(rightControl.x)} ${format(rightControl.y)}`,
    `${format(controlToEnd.x)} ${format(controlToEnd.y)}`,
    `${format(end.x)} ${format(end.y)}`,
  ].join(" ");
}

export function createDiscArcFromControls(
  start: Point,
  end: Point,
  control1: Point,
  control2: Point,
  depth: number,
): ArcGeometry {
  return Object.freeze({
    depth,
    control1: Object.freeze({ ...control1 }),
    control2: Object.freeze({ ...control2 }),
    path: cubicPathThroughMidpoint(start, control1, control2, end),
  });
}

export function layoutVertices(vertexCount: number): readonly Vertex[] {
  if (!Number.isInteger(vertexCount) || vertexCount < 1) {
    throw new Error("vertexCount must be a positive integer");
  }

  const labelRadius = DISC_RADIUS + 42;
  return Array.from({ length: vertexCount }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / vertexCount;
    return {
      id: index + 1,
      angle,
      x: DISC_CENTER.x + DISC_RADIUS * Math.cos(angle),
      y: DISC_CENTER.y + DISC_RADIUS * Math.sin(angle),
      labelPosition: {
        x: DISC_CENTER.x + labelRadius * Math.cos(angle),
        y: DISC_CENTER.y + labelRadius * Math.sin(angle),
      },
    };
  });
}

export function buildEdges(example: DiagramModel): readonly DirectedEdge[] {
  const edges: DirectedEdge[] = [];

  example.cycles.forEach((cycle, cycleIndex) => {
    if (cycle.length === 1) {
      const vertex = cycle[0];
      if (vertex === undefined) return;
      edges.push({
        id: `cycle-${cycleIndex}-singleton`,
        cycleIndex,
        cycle,
        start: vertex,
        end: vertex,
        role: "singleton",
        lane: cycleIndex * 0.22,
      });
      return;
    }

    cycle.forEach((start, edgeIndex) => {
      const end = cycle[(edgeIndex + 1) % cycle.length];
      if (end === undefined) throw new Error("Cycle edge has no endpoint");

      const role: EdgeRole = edgeIndex === cycle.length - 1 ? "return" : "forward";
      const lane = cycleIndex * 0.22 + edgeIndex * 0.06;
      edges.push({
        id: `cycle-${cycleIndex}-edge-${edgeIndex}`,
        cycleIndex,
        cycle,
        start,
        end,
        role,
        lane,
      });
    });
  });

  return edges;
}

export function createDiscLayout(example: DiagramModel): DiscLayout {
  return {
    vertices: layoutVertices(example.vertexCount),
    edges: buildEdges(example),
  };
}

function cyclicSeparation(start: number, end: number, vertexCount: number): number {
  const direct = Math.abs(end - start);
  return Math.min(direct, vertexCount - direct);
}

function controlRadiusRatio(edge: DirectedEdge, vertexCount: number): number {
  if (edge.role === "singleton") return DISC_SINGLETON_CONTROL_RADIUS_RATIO;
  if (edge.cycle.length === 2) return DISC_TWO_CYCLE_CONTROL_RADIUS_RATIO;
  const separation = cyclicSeparation(edge.start, edge.end, vertexCount);
  return Math.max(
    DISC_MIN_CONTROL_RADIUS_RATIO,
    DISC_ADJACENT_CONTROL_RADIUS_RATIO - Math.max(0, separation - 1) * DISC_CONTROL_RADIUS_STEP_PER_SPAN,
  );
}

function pointAtRadius(angle: number, radiusRatio: number): Point {
  return {
    x: DISC_CENTER.x + DISC_RADIUS * radiusRatio * Math.cos(angle),
    y: DISC_CENTER.y + DISC_RADIUS * radiusRatio * Math.sin(angle),
  };
}

function inwardLaneDirection(start: Vertex, end: Vertex): Point {
  // Midpoints determine the physically inward side except for a diameter.
  const towardCenter = subtract(DISC_CENTER, midpoint(start, end));
  return normalize(towardCenter);
}

function canonicalLaneDirection(start: Vertex, end: Vertex): Point {
  // Label order supplies a canonical normal, so reversing two-cycle notation
  // preserves the same unordered pair of lanes.
  const low = start.id < end.id ? start : end;
  const high = start.id < end.id ? end : start;
  const canonicalChord = normalize(subtract(high, low));
  return { x: -canonicalChord.y, y: canonicalChord.x };
}

export function arcDepth(edge: DirectedEdge, vertexCount: number): number {
  return DISC_RADIUS * (1 - controlRadiusRatio(edge, vertexCount));
}

function cubicPoint(start: Point, control1: Point, control2: Point, end: Point, t: number): Point {
  const remaining = 1 - t;
  return {
    x: remaining ** 3 * start.x + 3 * remaining ** 2 * t * control1.x + 3 * remaining * t ** 2 * control2.x + t ** 3 * end.x,
    y: remaining ** 3 * start.y + 3 * remaining ** 2 * t * control1.y + 3 * remaining * t ** 2 * control2.y + t ** 3 * end.y,
  };
}

export function sampleDiscArc(start: Point, end: Point, geometry: ArcGeometry, sampleCount = 97): readonly Point[] {
  const startToControl = midpoint(start, geometry.control1);
  const betweenControls = midpoint(geometry.control1, geometry.control2);
  const controlToEnd = midpoint(geometry.control2, end);
  const leftControl = midpoint(startToControl, betweenControls);
  const rightControl = midpoint(betweenControls, controlToEnd);
  const curveMidpoint = midpoint(leftControl, rightControl);
  return Object.freeze(Array.from({ length: sampleCount }, (_, index) => {
    const progress = index / (sampleCount - 1);
    return Object.freeze(progress <= 0.5
      ? cubicPoint(start, startToControl, leftControl, curveMidpoint, progress * 2)
      : cubicPoint(curveMidpoint, rightControl, controlToEnd, end, (progress - 0.5) * 2));
  }));
}

function mix(first: Point, second: Point, amount: number): Point {
  return add(first, scale(subtract(second, first), amount));
}

export function preferredTwoCycleLaneGap(start: Point, end: Point): number {
  return Math.min(
    DISC_TWO_CYCLE_MAX_LANE_GAP,
    Math.max(DISC_TWO_CYCLE_LANE_GAP, magnitude(subtract(end, start)) * DISC_TWO_CYCLE_CHORD_GAP_RATIO),
  );
}

export function makeDiscArc(
  start: Vertex,
  end: Vertex,
  edge: DirectedEdge,
  vertexCount: number,
  style: DiscArcStyle = {},
): ArcGeometry {
  const chord = subtract(end, start);
  const depth = arcDepth(edge, vertexCount);
  const rawCurvatureScale = style.curvatureScale ?? 1;
  const rawSingletonScale = style.singletonScale ?? 1;
  const rawLaneGap = style.twoCycleLaneGap;
  const rawChordProgress = style.chordProgress ?? DISC_CONTROL_CHORD_PROGRESS;
  if (!Number.isFinite(rawCurvatureScale) || !Number.isFinite(rawSingletonScale)
    || (rawLaneGap !== undefined && !Number.isFinite(rawLaneGap))
    || !Number.isFinite(rawChordProgress) || rawChordProgress <= 0 || rawChordProgress >= 0.5) {
    throw new Error("Disc arc style values must be finite");
  }
  const curvatureScale = Math.max(0, Math.min(1, rawCurvatureScale));
  let control1: Point;
  let control2: Point;

  if (edge.role === "singleton") {
    // The original construction places a singleton's handles on the adjacent
    // half-step rays at 80% radius. That makes loops scale with vertex density
    // instead of overlapping at high support. n=1 uses quarter-turn handles so
    // its only loop has nonzero area rather than collapsing onto a diameter.
    const halfStep = Math.min(Math.PI / 2, Math.PI / vertexCount);
    const singletonScale = Math.max(0, Math.min(1, rawSingletonScale));
    control1 = mix(start, pointAtRadius(start.angle - halfStep, DISC_SINGLETON_CONTROL_RADIUS_RATIO), singletonScale);
    control2 = mix(start, pointAtRadius(start.angle + halfStep, DISC_SINGLETON_CONTROL_RADIUS_RATIO), singletonScale);
  } else {
    const ratio = controlRadiusRatio(edge, vertexCount);
    const straightControl1 = add(start, scale(chord, rawChordProgress));
    const straightControl2 = add(end, scale(chord, -rawChordProgress));
    // The preferred visual candidate follows the older renderer's radial
    // depth rhythm but adds chordwise endpoint progress. It is deliberately
    // notation-symmetric; the whole-layout factory certifies it and backs off
    // to the exact noncrossing scaffold when a dense arrangement needs less.
    const preferredControl1 = add(pointAtRadius(start.angle, ratio), scale(chord, rawChordProgress));
    const preferredControl2 = add(pointAtRadius(end.angle, ratio), scale(chord, -rawChordProgress));
    control1 = mix(straightControl1, preferredControl1, curvatureScale);
    control2 = mix(straightControl2, preferredControl2, curvatureScale);

    if (edge.cycle.length === 2) {
      // A non-diameter transposition uses two lanes on the geometrically inward
      // side of its chord. This avoids sweeping an outward lane through blocks
      // nested in the short boundary interval. The unordered pair of loci is
      // unchanged when two-cycle notation is reversed; no closing edge gets a
      // special stroke or a special curvature formula.
      const targetGap = Math.max(
        DISC_TWO_CYCLE_ABSOLUTE_MIN_LANE_GAP,
        Math.min(preferredTwoCycleLaneGap(start, end), rawLaneGap ?? preferredTwoCycleLaneGap(start, end)),
      );
      const deepLane = edge.start > edge.end;
      const inward = inwardLaneDirection(start, end);
      if (magnitude(inward) > 1e-9) {
        const sharedMidpointBow = curvatureScale * Math.min(36, magnitude(chord) * 0.06);
        const midpointBow = sharedMidpointBow + (deepLane ? targetGap : 0);
        const controlBow = scale(inward, midpointBow / 0.75);
        control1 = add(straightControl1, controlBow);
        control2 = add(straightControl2, controlBow);
      } else {
        // Diameters have no interior side, so a canonical two-sided lens is the
        // only notation-invariant construction. Opposing control translations
        // yield 3/2 of their magnitude as aligned midpoint separation.
        const correction = scale(canonicalLaneDirection(start, end), targetGap / 1.5);
        const signedCorrection = deepLane ? correction : scale(correction, -1);
        control1 = add(straightControl1, signedCorrection);
        control2 = add(straightControl2, signedCorrection);
      }
    }
  }

  return createDiscArcFromControls(start, end, control1, control2, depth);
}
