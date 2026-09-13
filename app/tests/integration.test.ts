import { describe, expect, it } from "vitest";
import { createDiscLayout, makeDiscArc } from "../src/geometry/disc";
import { parseNoncrossingPartition } from "../src/math/parser";
import { partitionDiagram } from "../src/renderer/model";

function pathGeometry(input: string): readonly string[] {
  const parsed = parseNoncrossingPartition(input);
  if (!parsed.ok) throw new Error(parsed.error.kind);
  const diagram = partitionDiagram(parsed.value);
  const layout = createDiscLayout(diagram);
  return layout.edges.map((edge) => {
    const start = layout.vertices[edge.start - 1];
    const end = layout.vertices[edge.end - 1];
    if (!start || !end) throw new Error("Missing integration vertex");
    return makeDiscArc(start, end, edge, diagram.vertexCount).path;
  });
}

describe("renderer-domain integration", () => {
  it("renders equivalent block orientations identically", () => {
    expect(pathGeometry("(1 2 3)")).toEqual(pathGeometry("(3 1 2)"));
    expect(pathGeometry("(1 2 3)")).toEqual(pathGeometry("(1 3 2)"));
  });

  it("renders equivalent block orderings identically", () => {
    expect(pathGeometry("(1 4)(2 3)")).toEqual(pathGeometry("(2 3)(4 1)"));
  });

  it("preserves admitted edge roles from canonical permutations", () => {
    const parsed = parseNoncrossingPartition("(1 2 3)");
    if (!parsed.ok) throw new Error(parsed.error.kind);
    const diagram = partitionDiagram(parsed.value);
    const layout = createDiscLayout(diagram);
    expect(layout.edges.map((edge) => edge.role)).toEqual(["forward", "forward", "return"]);
  });
});
