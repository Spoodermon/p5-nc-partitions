import { describe, expect, it } from "vitest";
import { getExample } from "../src/examples";
import { arcDepth, createDiscLayout, makeDiscArc } from "../src/geometry";

describe("curved edge grammar", () => {
  it("creates two distinct curved paths for the two-cycle", () => {
    const example = getExample("two-cycle");
    const layout = createDiscLayout(example);
    expect(layout.edges).toHaveLength(2);

    const paths = layout.edges.map((edge) => {
      const start = layout.vertices[edge.start - 1];
      const end = layout.vertices[edge.end - 1];
      if (!start || !end) throw new Error("Missing test vertex");
      return makeDiscArc(start, end, edge, example.vertexCount).path;
    });

    expect(paths[0]).not.toBe(paths[1]);
  });

  it("classifies exactly one deeper return edge for the three-cycle", () => {
    const example = getExample("three-cycle");
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
});
