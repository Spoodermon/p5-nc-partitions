// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { parseDiscPartition } from "../src/math/parser";
import { partitionDiagram } from "../src/renderer/model";
import { renderDiagram } from "../src/renderer/svgRenderer";

const REPORTED_NOTATION = "(1 2 3 5 7 8 12)(4)(6)(9 11)(10)";

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 20, height: 20 }),
  });
});

function model() {
  const parsed = parseDiscPartition(REPORTED_NOTATION);
  if (!parsed.ok) throw new Error(parsed.error.kind);
  return partitionDiagram(parsed.value);
}

function render(overrides: Partial<Parameters<typeof renderDiagram>[2]> = {}) {
  const container = document.createElement("div");
  return renderDiagram(container, model(), {
    showDirection: false,
    showRibbonFill: false,
    selectedEdgeId: null,
    cycleEdgeWidth: 3.4,
    outerBoundaryWidth: 2.5,
    ...overrides,
  }, { onSelect: () => undefined }).svg;
}

function twoCyclePaths(svg: SVGSVGElement): readonly SVGPathElement[] {
  return [...svg.querySelectorAll<SVGPathElement>('[data-layer="edges"] [data-cycle="(9 11)"]')];
}

describe("production disc SVG renderer", () => {
  it("renders the reported two-cycle as two directed edges around a nondegenerate fill", () => {
    const diagram = model();
    const cycleIndex = diagram.cycles.findIndex((cycle) => cycle.length === 2 && cycle[0] === 9 && cycle[1] === 11);
    const svg = render({ showRibbonFill: true, showDirection: true });
    const paths = twoCyclePaths(svg);

    expect(paths).toHaveLength(2);
    expect(paths.map((path) => path.getAttribute("data-role"))).toEqual(["forward", "return"]);
    expect(new Set(paths.map((path) => path.getAttribute("data-edge-id"))).size).toBe(2);
    expect(paths[0]?.getAttribute("d")).not.toBe(paths[1]?.getAttribute("d"));
    expect(paths.every((path) => path.hasAttribute("marker-mid"))).toBe(true);

    const fill = svg.querySelector<SVGPathElement>(`[data-cycle-fill="${cycleIndex}"]`);
    const fillPath = fill?.getAttribute("d") ?? "";
    expect(fill).not.toBeNull();
    expect(fillPath.match(/\bC\b/g)).toHaveLength(4);
    expect(fillPath).toMatch(/\sZ$/);
  });

  it("preserves both two-cycle geometries across widths, fill, arrows, and either selection", () => {
    const plain = render();
    const baseline = new Map(twoCyclePaths(plain).map((path) => [
      path.getAttribute("data-edge-id"),
      path.getAttribute("d"),
    ]));

    for (const edgeId of baseline.keys()) {
      if (!edgeId) throw new Error("Missing two-cycle edge id");
      const presented = render({
        showRibbonFill: true,
        showDirection: true,
        selectedEdgeId: edgeId,
        cycleEdgeWidth: 8,
        outerBoundaryWidth: 8,
      });
      const paths = twoCyclePaths(presented);
      expect(paths.map((path) => path.getAttribute("d"))).toEqual([...baseline.values()]);
      expect(paths.filter((path) => path.classList.contains("is-selected")).map((path) => path.getAttribute("data-edge-id"))).toEqual([edgeId]);
    }
  });
});
