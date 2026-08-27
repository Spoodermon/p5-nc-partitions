import type { DiagramModel, RenderCycle } from "./types";

export const VIEWBOX_SIZE = 1000;
export const DISC_CENTER = { x: 500, y: 500 } as const;
export const DISC_RADIUS = 370;
// A geometry-level separation contract for the two directed sides of a
// transposition ribbon. Responsive SVG scaling may change its on-screen size.
export const DISC_TWO_CYCLE_LANE_GAP = 12;
const TWO_CYCLE_RETURN_DEPTH_PREMIUM = 38;

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

function cycleInteriorBend(start: Vertex, end: Vertex, edge: DirectedEdge, vertexCount: number): Point {
  const chord = subtract(end, start);
  const left = normalize({ x: -chord.y, y: chord.x });
  let signedArea = 0;
  for (const label of edge.cycle) {
    if (label === edge.start || label === edge.end) continue;
    const angle = -Math.PI / 2 + ((label - 1) * Math.PI * 2) / vertexCount;
    const point = { x: DISC_CENTER.x + DISC_RADIUS * Math.cos(angle), y: DISC_CENTER.y + DISC_RADIUS * Math.sin(angle) };
    signedArea += chord.x * (point.y - start.y) - chord.y * (point.x - start.x);
  }
  if (Math.abs(signedArea) > 1e-7) return scale(left, Math.sign(signedArea));
  return normalize(subtract(DISC_CENTER, midpoint(start, end)));
}

export function arcDepth(edge: DirectedEdge, vertexCount: number): number {
  if (edge.role === "singleton") return 54;
  const separation = cyclicSeparation(edge.start, edge.end, vertexCount);
  // Antipodal transpositions form a balanced two-sided lens. Their directed
  // edges already bend to opposite sides of the diameter, so a shared depth
  // gives the ribbon reflection symmetry instead of an oversized return side.
  if (edge.cycle.length === 2 && separation * 2 === vertexCount) return 142;
  const baseDepth = 58 + separation * 18;
  // A polygonal cycle has no geometrically privileged closing edge. Equal
  // cyclic spans therefore use equal curvature in either direction, which
  // keeps the closing arc from folding back through its own cycle. A
  // two-cycle alone needs a modest second lane so both directions stay visible.
  if (edge.cycle.length === 2) return baseDepth + (edge.role === "return" ? TWO_CYCLE_RETURN_DEPTH_PREMIUM : 0);
  return baseDepth;
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
    return progress <= 0.5
      ? cubicPoint(start, startToControl, leftControl, curveMidpoint, progress * 2)
      : cubicPoint(curveMidpoint, rightControl, controlToEnd, end, (progress - 0.5) * 2);
  }));
}

export function makeDiscArc(
  start: Vertex,
  end: Vertex,
  edge: DirectedEdge,
  vertexCount: number,
): ArcGeometry {
  const chord = subtract(end, start);
  const chordLength = magnitude(chord);
  const chordDirection = normalize(chord);
  const chordMidpoint = midpoint(start, end);
  const depth = arcDepth(edge, vertexCount);

  let bendDirection = edge.cycle.length > 2
    ? cycleInteriorBend(start, end, edge, vertexCount)
    : normalize(subtract(DISC_CENTER, chordMidpoint));
  let control1: Point;
  let control2: Point;

  if (edge.role === "singleton") {
    const inward = normalize(subtract(DISC_CENTER, start));
    const tangent = { x: -Math.sin(start.angle), y: Math.cos(start.angle) };
    control1 = add(add(start, scale(tangent, 58)), scale(inward, depth));
    control2 = add(add(start, scale(tangent, -58)), scale(inward, depth));
    // Antipodal endpoints have no unique inward normal. A two-cycle deliberately
    // assigns its two directions to opposite sides, producing a readable lens.
  } else if (edge.cycle.length === 2 && magnitude(bendDirection) < 1e-9) {
    const perpendicular = { x: -chordDirection.y, y: chordDirection.x };
    bendDirection = perpendicular;
    const handle = Math.min(155, Math.max(68, chordLength * 0.27));
    const offset = scale(bendDirection, depth / 0.75);
    control1 = add(add(start, scale(chordDirection, handle)), offset);
    control2 = add(add(end, scale(chordDirection, -handle)), offset);
  } else if (edge.cycle.length === 2) {
    // Reversing a cubic swaps its endpoints and controls. If both directions
    // use the same capped bow, they therefore describe the exact same locus;
    // the thicker return stroke hides the forward stroke and the ribbon has
    // zero area. Split a shared inward bow into two explicit lanes. Both stay
    // on the interior side of the chord, including for short boundary chords.
    if (magnitude(bendDirection) < 1e-9) bendDirection = { x: -chordDirection.y, y: chordDirection.x };
    // Unlike polygon arcs, a two-cycle can join adjacent vertices at the
    // maximum support. A fixed minimum handle would overshoot those very short
    // chords and make the two lanes loop across each other.
    const handle = Math.min(155, chordLength * 0.28);
    const forwardDepth = depth - (edge.role === "return" ? TWO_CYCLE_RETURN_DEPTH_PREMIUM : 0);
    const sharedBowAmount = Math.min(36, forwardDepth * 0.24, chordLength * 0.06);
    // A symmetric cubic's midpoint moves by 3/4 of its control-point bow.
    const controlLaneGap = DISC_TWO_CYCLE_LANE_GAP / 0.75;
    const shallowBowAmount = Math.max(2, sharedBowAmount - controlLaneGap / 2);
    const bowAmount = shallowBowAmount + (edge.role === "return" ? controlLaneGap : 0);
    const bow = scale(bendDirection, bowAmount);
    control1 = add(add(start, scale(chordDirection, handle)), bow);
    control2 = add(add(end, scale(chordDirection, -handle)), bow);
  } else {
    // Both handles use one polygon-interior normal. Unlike independent radial
    // handles, this cannot form an S-turn near either endpoint. Keeping the bow
    // bounded by the chord length also prevents long diagonals from sweeping
    // through shorter edges of the same noncrossing block.
    if (magnitude(bendDirection) < 1e-9) bendDirection = { x: -chordDirection.y, y: chordDirection.x };
    const handle = Math.min(155, Math.max(54, chordLength * 0.28));
    const bowAmount = Math.min(36, depth * 0.24, chordLength * 0.06);
    const bow = scale(bendDirection, bowAmount);
    control1 = add(add(start, scale(chordDirection, handle)), bow);
    control2 = add(add(end, scale(chordDirection, -handle)), bow);
  }

  return {
    depth,
    control1,
    control2,
    path: cubicPathThroughMidpoint(start, control1, control2, end),
  };
}
