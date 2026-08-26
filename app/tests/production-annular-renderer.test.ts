// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { routeAnnularPermutation } from "../src/geometry/annular-routing";
import { parseAnnularPermutation } from "../src/math";
import { annularDiagram } from "../src/renderer/annularModel";
import { renderAnnularDiagram } from "../src/renderer/annularSvgRenderer";
import { assertExportIsVector, serializeFigure } from "../src/renderer/export";
import { processAnnularInput } from "../src/production/annularController";

function model(text: string, p: number, q: number) {
  const parsed = parseAnnularPermutation(text, p, q);
  if (!parsed.ok) throw new Error(parsed.error.kind);
  const routed = routeAnnularPermutation(parsed.value);
  if (!routed.isRoutable) throw new Error(routed.reason);
  return annularDiagram(parsed.value, routed);
}

function render(text: string, p: number, q: number, overrides: Partial<Parameters<typeof renderAnnularDiagram>[2]> = {}) {
  const container = document.createElement("div");
  const result = renderAnnularDiagram(container, model(text, p, q), {
    showDirection: false, showRibbonFill: false, selectedEdgeId: null,
    cycleEdgeWidth: 3.4, outerBoundaryWidth: 2.5, innerBoundaryWidth: 2.5, ...overrides,
  }, { onSelect: () => undefined });
  return result.svg;
}

function edgePaths(svg: SVGSVGElement): readonly string[] {
  return [...svg.querySelectorAll<SVGPathElement>("[data-cycle-edge]")].map((path) => path.getAttribute("d") ?? "");
}

describe("production annular SVG renderer", () => {
  it("preserves exact edge paths across fill, arrows, widths, and selection", () => {
    const fixture = ["(1 4)(2)(3)(5)", 3, 2] as const;
    const plain = render(...fixture);
    const edgeId = plain.querySelector("[data-cycle-edge]")?.getAttribute("data-edge-id") ?? null;
    const presented = render(...fixture, { showRibbonFill: true, showDirection: true, selectedEdgeId: edgeId, cycleEdgeWidth: 7, outerBoundaryWidth: 6, innerBoundaryWidth: 1 });
    expect(edgePaths(presented)).toEqual(edgePaths(plain));
    expect(presented.querySelectorAll("[data-cycle-fill]").length).toBeGreaterThan(0);
    expect(presented.querySelectorAll("[data-direction-marker]")).toHaveLength(edgePaths(plain).length);
    expect(presented.querySelector('[data-boundary="outer"]')?.getAttribute("stroke-width")).toBe("6");
    expect(presented.querySelector('[data-boundary="inner"]')?.getAttribute("stroke-width")).toBe("1");
  });

  it("exposes outer, inner, through, and singleton edge metadata", () => {
    const svg = render("(1)(2 3)(4 5 6 7)", 4, 3);
    const paths = [...svg.querySelectorAll("[data-cycle-edge]")];
    expect(paths.some((path) => path.getAttribute("data-cycle-kind") === "outer")).toBe(true);
    expect(paths.some((path) => path.getAttribute("data-role") === "singleton")).toBe(true);
    const boundaryCycles = render("(1 2 3 4)(5 6 7)", 4, 3);
    expect(boundaryCycles.querySelector('[data-cycle-kind="inner"]')).not.toBeNull();
    const through = render("(1 4)(2)(3)(5)", 3, 2);
    expect(through.querySelector('[data-cycle-kind="through"]')).not.toBeNull();
  });

  it("exports representative routed figures from the live SVG DOM as clean vectors", () => {
    for (const [text, p, q, fill] of [
      ["(1 2)", 1, 1, false],
      ["(1 8)(2)(3 4 7)(5 6)", 5, 3, false],
      ["(1)(2 3)(4 5 6 7)", 4, 3, true],
      ["(1)(2)", 1, 1, true],
      ["(1 11)(2 3 16)(4 5 6)(7 13)(8)(9 12)(10)(14 15)(17)", 10, 7, true],
    ] as const) {
      const svg = render(text, p, q, { showDirection: true, showRibbonFill: fill, cycleEdgeWidth: 4.6, outerBoundaryWidth: 3, innerBoundaryWidth: 2 });
      const serialized = serializeFigure(svg);
      expect(() => assertExportIsVector(serialized)).not.toThrow();
      expect(serialized).not.toMatch(/diagnostic|seam|collar|winding|<script|<foreignObject|<canvas|NaN|undefined/);
      expect(serialized).toContain('data-boundary="inner"');
      expect(serialized.match(/data-cycle-edge/g)?.length).toBe(svg.querySelectorAll("[data-cycle-edge]").length);
      expect(serialized.match(/data-direction-marker/g)?.length).toBe(svg.querySelectorAll("[data-cycle-edge]").length);
      if (fill) expect(serialized).toContain("data-cycle-fill");
    }
  }, 30_000);

  it("exports the resolved permutation produced by canonical block interpretation", () => {
    const accepted = processAnnularInput("4", "2", "(1 4 3)(2)(5)(6)", routeAnnularPermutation, "canonical-blocks");
    if (!accepted.ok) throw new Error(accepted.error.message);
    expect(accepted.wasAutoOriented).toBe(true);

    const container = document.createElement("div");
    const rendered = renderAnnularDiagram(container, annularDiagram(accepted.permutation, accepted.routed), {
      showDirection: false, showRibbonFill: false, selectedEdgeId: null,
      cycleEdgeWidth: 3.4, outerBoundaryWidth: 2.5, innerBoundaryWidth: 2.5,
    }, { onSelect: () => undefined });
    const exported = serializeFigure(rendered.svg);
    expect(exported).toContain(accepted.resolvedNotation);
    expect(exported).not.toContain(accepted.sourceNotation);
  });
});
