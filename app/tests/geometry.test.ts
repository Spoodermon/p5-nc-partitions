import { describe, expect, it } from "vitest";
import { getExample } from "../src/ui/examples";
import {
  DISC_CENTER,
  DISC_RADIUS,
  DISC_TWO_CYCLE_LANE_GAP,
  arcDepth,
  createDiscLayout,
  makeDiscArc,
  sampleDiscArc,
  type Point,
} from "../src/geometry/disc";
import type { DiagramModel } from "../src/geometry/types";
import { parseDiscPartition } from "../src/math/parser";
import { partitionDiagram } from "../src/renderer/model";

function exampleDiagram(id: string) {
  const example = getExample(id);
  const parsed = parseDiscPartition(example.notation);
  if (!parsed.ok) throw new Error(parsed.error.kind);
  return partitionDiagram(parsed.value);
}

function notationDiagram(notation: string) {
  const parsed = parseDiscPartition(notation);
  if (!parsed.ok) throw new Error(parsed.error.kind);
  return partitionDiagram(parsed.value);
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function properIntersection(a: Point, b: Point, c: Point, d: Point): boolean {
  const values = [cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)];
  return values[0]! * values[1]! < -1e-5 && values[2]! * values[3]! < -1e-5;
}

function twoCycleGeometry(vertexCount: number, startLabel: number, endLabel: number, sampleCount = 33) {
  const cycle = Object.freeze([startLabel, endLabel]);
  const model: DiagramModel = {
    notation: `(${startLabel} ${endLabel})`,
    vertexCount,
    cycles: Object.freeze([cycle]),
  };
  const layout = createDiscLayout(model);
  const forwardEdge = layout.edges.find((edge) => edge.role === "forward");
  const returnEdge = layout.edges.find((edge) => edge.role === "return");
  const start = layout.vertices[startLabel - 1];
  const end = layout.vertices[endLabel - 1];
  if (!forwardEdge || !returnEdge || !start || !end) throw new Error("Missing two-cycle geometry");
  const forward = makeDiscArc(start, end, forwardEdge, vertexCount);
  const reverse = makeDiscArc(end, start, returnEdge, vertexCount);
  return {
    start,
    end,
    forward,
    reverse,
    forwardPoints: sampleDiscArc(start, end, forward, sampleCount),
    reversePoints: sampleDiscArc(end, start, reverse, sampleCount),
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polygonArea(points: readonly Point[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current.x * next.y - current.y * next.x;
  }
  return Math.abs(twiceArea) / 2;
}

function requireGeometry(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

describe("curved edge grammar", () => {
  it("creates two distinct curved paths for the two-cycle", () => {
    const example = exampleDiagram("two-cycle");
    const layout = createDiscLayout(example);
    expect(layout.edges).toHaveLength(2);

    const geometries = layout.edges.map((edge) => {
      const start = layout.vertices[edge.start - 1];
      const end = layout.vertices[edge.end - 1];
      if (!start || !end) throw new Error("Missing test vertex");
      return makeDiscArc(start, end, edge, example.vertexCount);
    });

    expect(geometries[0]?.path).not.toBe(geometries[1]?.path);
    expect(geometries[0]?.depth).toBe(geometries[1]?.depth);
    expect(geometries[0]?.control1.x).toBeCloseTo(1000 - (geometries[1]?.control2.x ?? 0), 10);
    expect(geometries[0]?.control2.x).toBeCloseTo(1000 - (geometries[1]?.control1.x ?? 0), 10);
  });

  it("keeps both directions of every supported two-cycle in distinct geometric lanes", () => {
    let checked = 0;
    for (let vertexCount = 2; vertexCount <= 400; vertexCount += 1) {
      for (let separation = 1; separation <= Math.floor(vertexCount / 2); separation += 1) {
        checked += 1;
        const fixture = `${vertexCount} vertices, separation ${separation}`;
        const geometry = twoCycleGeometry(vertexCount, 1, 1 + separation);
        const last = geometry.forwardPoints.length - 1;
        requireGeometry(distance(geometry.forwardPoints[0]!, geometry.start) === 0, `${fixture}: forward start moved`);
        requireGeometry(distance(geometry.forwardPoints[last]!, geometry.end) === 0, `${fixture}: forward end moved`);
        requireGeometry(distance(geometry.reversePoints[0]!, geometry.end) === 0, `${fixture}: return start moved`);
        requireGeometry(distance(geometry.reversePoints[last]!, geometry.start) === 0, `${fixture}: return end moved`);

        const midpointGap = distance(
          geometry.forwardPoints[Math.floor(last / 2)]!,
          geometry.reversePoints[Math.ceil(last / 2)]!,
        );
        requireGeometry(
          midpointGap >= DISC_TWO_CYCLE_LANE_GAP - 1e-8,
          `${fixture}: midpoint lane gap ${midpointGap}`,
        );

        let lateralSign = 0;
        for (const index of [4, 8, 16, 24, 28]) {
          const forward = geometry.forwardPoints[index]!;
          const reverseAligned = geometry.reversePoints[last - index]!;
          const delta = { x: reverseAligned.x - forward.x, y: reverseAligned.y - forward.y };
          const lateral = (geometry.end.x - geometry.start.x) * delta.y
            - (geometry.end.y - geometry.start.y) * delta.x;
          requireGeometry(Math.abs(lateral) > 1e-7, `${fixture}: coincident at sample ${index}`);
          const sign = Math.sign(lateral);
          if (lateralSign === 0) lateralSign = sign;
          requireGeometry(sign === lateralSign, `${fixture}: lanes swap at sample ${index}`);
        }

        for (const point of [...geometry.forwardPoints, ...geometry.reversePoints]) {
          requireGeometry(Number.isFinite(point.x) && Number.isFinite(point.y), `${fixture}: non-finite sample`);
          requireGeometry(distance(point, DISC_CENTER) <= DISC_RADIUS + 1e-8, `${fixture}: sample left disc`);
        }

        const chordLength = distance(geometry.start, geometry.end);
        const area = polygonArea([...geometry.forwardPoints, ...geometry.reversePoints]);
        requireGeometry(
          area > chordLength * DISC_TWO_CYCLE_LANE_GAP * 0.2,
          `${fixture}: ribbon area ${area}`,
        );
      }
    }
    expect(checked).toBe(40_000);
  }, 20_000);

  it("keeps representative two-cycle ribbons inside the disc without proper crossings", () => {
    for (const [vertexCount, startLabel, endLabel] of [
      [12, 9, 11],
      [12, 1, 2],
      [12, 12, 2],
      [11, 1, 6],
      [12, 1, 7],
      [400, 1, 2],
    ] as const) {
      const geometry = twoCycleGeometry(vertexCount, startLabel, endLabel, 97);
      const fixture = `${vertexCount} vertices, ${startLabel}<->${endLabel}`;
      expect(polygonArea([...geometry.forwardPoints, ...geometry.reversePoints]), `${fixture}: ribbon area`).toBeGreaterThan(0);

      for (let forwardIndex = 1; forwardIndex < geometry.forwardPoints.length - 2; forwardIndex += 1) {
        for (let reverseIndex = 1; reverseIndex < geometry.reversePoints.length - 2; reverseIndex += 1) {
          expect(properIntersection(
            geometry.forwardPoints[forwardIndex]!,
            geometry.forwardPoints[forwardIndex + 1]!,
            geometry.reversePoints[reverseIndex]!,
            geometry.reversePoints[reverseIndex + 1]!,
          ), `${fixture}: lane crossing`).toBe(false);
        }
      }
    }
  });

  it("classifies one return edge without assigning it an arbitrary depth premium", () => {
    const example = exampleDiagram("three-cycle");
    const layout = createDiscLayout(example);
    const returns = layout.edges.filter((edge) => edge.role === "return");
    const forwards = layout.edges.filter((edge) => edge.role === "forward");

    expect(layout.edges).toHaveLength(3);
    expect(returns).toHaveLength(1);
    expect(forwards).toHaveLength(2);
    expect(arcDepth(returns[0]!, example.vertexCount)).toBe(
      arcDepth(forwards[0]!, example.vertexCount),
    );
  });

  it("gives equal-span polygon edges equal curvature and no proper crossings", () => {
    for (const notation of ["(1 2 8)(3 7)(4)(5 6)", "(1 2 5 8)(3)(4)(6 7)", "(1 3 4 8)(2)(5 6)(7)"]) {
      const model = notationDiagram(notation);
      const layout = createDiscLayout(model);
      const routed = layout.edges.filter((edge) => edge.role !== "singleton").map((edge) => {
        const start = layout.vertices[edge.start - 1]!;
        const end = layout.vertices[edge.end - 1]!;
        const geometry = makeDiscArc(start, end, edge, model.vertexCount);
        return { edge, geometry, points: sampleDiscArc(start, end, geometry) };
      });
      const featured = routed.filter(({ edge }) => edge.cycleIndex === 0);
      const adjacent = featured.filter(({ edge }) => Math.min(Math.abs(edge.end - edge.start), model.vertexCount - Math.abs(edge.end - edge.start)) === 1);
      expect(new Set(adjacent.map(({ geometry }) => geometry.depth)).size).toBe(1);
      for (let first = 0; first < routed.length; first += 1) for (let second = first + 1; second < routed.length; second += 1) {
        const a = routed[first]!; const b = routed[second]!;
        const shared = new Set([a.edge.start, a.edge.end].filter((label) => label === b.edge.start || label === b.edge.end));
        const sharedPoints = [...shared].map((label) => layout.vertices[label - 1]!);
        for (let ai = 0; ai < a.points.length - 1; ai += 1) for (let bi = 0; bi < b.points.length - 1; bi += 1) {
          const nearSharedEndpoint = sharedPoints.some((point) => [a.points[ai]!, a.points[ai + 1]!, b.points[bi]!, b.points[bi + 1]!]
            .some((sample) => Math.hypot(sample.x - point.x, sample.y - point.y) < 30));
          if (nearSharedEndpoint) continue;
          expect(properIntersection(a.points[ai]!, a.points[ai + 1]!, b.points[bi]!, b.points[bi + 1]!), `${notation}: ${a.edge.start}->${a.edge.end} crosses ${b.edge.start}->${b.edge.end}`).toBe(false);
        }
      }
    }
  });

  it("renders singleton blocks as restrained closed loops", () => {
    const example = exampleDiagram("representative");
    const layout = createDiscLayout(example);
    const singleton = layout.edges.find((edge) => edge.role === "singleton");
    expect(singleton).toBeDefined();

    const vertex = layout.vertices[(singleton?.start ?? 1) - 1];
    if (!singleton || !vertex) throw new Error("Missing singleton test geometry");
    const geometry = makeDiscArc(vertex, vertex, singleton, example.vertexCount);

    expect(singleton.start).toBe(6);
    expect(singleton.end).toBe(6);
    expect(geometry.depth).toBe(54);
    expect(geometry.path.match(/\bC\b/g)).toHaveLength(2);
  });
});
