import { describe, expect, it } from "vitest";
import { getExample } from "../src/ui/examples";
import { arcDepth, createDiscLayout, makeDiscArc } from "../src/geometry/disc";
import { parseDiscPartition } from "../src/math/parser";
import { partitionDiagram } from "../src/renderer/model";

function exampleDiagram(id: string) {
  const example = getExample(id);
  const parsed = parseDiscPartition(example.notation);
  if (!parsed.ok) throw new Error(parsed.error.kind);
  return partitionDiagram(parsed.value);
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

  it("classifies exactly one deeper return edge for the three-cycle", () => {
    const example = exampleDiagram("three-cycle");
    const layout = createDiscLayout(example);
    const returns = layout.edges.filter((edge) => edge.role === "return");
    const forwards = layout.edges.filter((edge) => edge.role === "forward");

    expect(layout.edges).toHaveLength(3);
    expect(returns).toHaveLength(1);
    expect(forwards).toHaveLength(2);
    expect(arcDepth(returns[0]!, example.vertexCount)).toBeGreaterThan(
      Math.max(...forwards.map((edge) => arcDepth(edge, example.vertexCount))),
    );
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
