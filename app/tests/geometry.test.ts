import { describe, expect, it } from "vitest";
import { getExample } from "../src/ui/examples";
import { arcDepth, createDiscLayout, makeDiscArc, sampleDiscArc, type Point } from "../src/geometry/disc";
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
