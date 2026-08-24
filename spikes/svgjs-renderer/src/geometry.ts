import type { Cycle, DiagramExample } from "./examples";

export const VIEWBOX_SIZE = 1000;
export const DISC_CENTER = { x: 500, y: 500 } as const;
export const DISC_RADIUS = 370;

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
  readonly cycle: Cycle;
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

export function buildEdges(example: DiagramExample): readonly DirectedEdge[] {
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

export function createDiscLayout(example: DiagramExample): DiscLayout {
  return {
    vertices: layoutVertices(example.vertexCount),
    edges: buildEdges(example),
  };
}

function cyclicSeparation(start: number, end: number, vertexCount: number): number {
  const direct = Math.abs(end - start);
  return Math.min(direct, vertexCount - direct);
}

export function arcDepth(edge: DirectedEdge, vertexCount: number): number {
  if (edge.role === "singleton") return 54;
  const separation = cyclicSeparation(edge.start, edge.end, vertexCount);
  const laneOffset = edge.lane * 32;
  if (edge.role === "return") {
    return 170 + separation * 28 + laneOffset;
  }
  return 58 + separation * 18 + laneOffset;
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

  let bendDirection = normalize(subtract(DISC_CENTER, chordMidpoint));
  let control1: Point;
  let control2: Point;

  if (edge.role === "singleton") {
    const inward = normalize(subtract(DISC_CENTER, start));
    const tangent = { x: -Math.sin(start.angle), y: Math.cos(start.angle) };
    control1 = add(add(start, scale(tangent, 58)), scale(inward, depth));
    control2 = add(add(start, scale(tangent, -58)), scale(inward, depth));
    // Antipodal endpoints have no unique inward normal. A two-cycle deliberately
    // assigns its two directions to opposite sides, producing a readable lens.
  } else if (magnitude(bendDirection) < 1e-9) {
    const perpendicular = { x: -chordDirection.y, y: chordDirection.x };
    bendDirection = perpendicular;
    const handle = Math.min(155, Math.max(68, chordLength * 0.27));
    const offset = scale(bendDirection, depth / 0.75);
    control1 = add(add(start, scale(chordDirection, handle)), offset);
    control2 = add(add(end, scale(chordDirection, -handle)), offset);
  } else {
    // Radial control handles reproduce the calm disc-arc grammar of the p5
    // reference while making depth explicit: larger depth pulls both handles
    // farther toward the centre and creates the sweeping return hierarchy.
    const startInward = normalize(subtract(DISC_CENTER, start));
    const endInward = normalize(subtract(DISC_CENTER, end));
    control1 = add(start, scale(startInward, depth));
    control2 = add(end, scale(endInward, depth));

    // Near-antipodal endpoints can make radial handles appear almost chordal.
    // Add a deterministic common inward bow so every edge remains visibly curved.
    const midpointRadius = magnitude(subtract(chordMidpoint, DISC_CENTER));
    const nearAntipodalBow = Math.max(0, DISC_RADIUS * 0.4 - midpointRadius);
    if (nearAntipodalBow > 0) {
      const roleBoost = edge.role === "return" ? 1.15 : 0.75;
      const bow = scale(bendDirection, nearAntipodalBow * roleBoost);
      control1 = add(control1, bow);
      control2 = add(control2, bow);
    }
  }

  return {
    depth,
    control1,
    control2,
    path: cubicPathThroughMidpoint(start, control1, control2, end),
  };
}
