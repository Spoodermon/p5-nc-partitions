import { describe, expect, it } from "vitest";
import {
  ANNULAR_CENTER,
  ANNULAR_INNER_RADIUS,
  ANNULAR_OUTER_RADIUS,
  annularVertex,
  createAnnularLayout,
  defaultAnnularPhase,
  leastCommonMultiple,
} from "../src/geometry/annular";

const TOLERANCE = 1e-9;

function radius(point: { readonly x: number; readonly y: number }): number {
  return Math.hypot(point.x - ANNULAR_CENTER.x, point.y - ANNULAR_CENTER.y);
}

function angularDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

describe("annular boundary layout", () => {
  it("places outer label 1 at noon and advances clockwise on the outer radius", () => {
    const layout = createAnnularLayout(8, 5);
    const first = annularVertex(layout, 1);
    const second = annularVertex(layout, 2);
    expect(first.boundaryPoint.x).toBeCloseTo(500, 10);
    expect(first.boundaryPoint.y).toBeCloseTo(130, 10);
    expect(second.angle).toBeGreaterThan(first.angle);
    for (let label = 1; label <= layout.p; label += 1) {
      expect(radius(annularVertex(layout, label).boundaryPoint)).toBeCloseTo(ANNULAR_OUTER_RADIUS, 10);
    }
  });

  it("places inner labels in counterclockwise screen order on the inner radius", () => {
    const layout = createAnnularLayout(8, 5);
    const first = annularVertex(layout, 9);
    const second = annularVertex(layout, 10);
    expect(second.angle).toBeLessThan(first.angle);
    for (let label = layout.p + 1; label <= layout.p + layout.q; label += 1) {
      const vertex = annularVertex(layout, label);
      expect(vertex.boundary).toBe("inner");
      expect(radius(vertex.boundaryPoint)).toBeCloseTo(ANNULAR_INNER_RADIUS, 10);
      expect(radius(vertex.labelPoint)).toBeLessThan(ANNULAR_INNER_RADIUS);
    }
  });

  it.each([
    [1, 1],
    [2, 2],
    [3, 4],
    [5, 3],
    [8, 5],
  ])("uses the half-alignment-grid phase for (%i,%i)", (p, q) => {
    const layout = createAnnularLayout(p, q);
    const expectedPhase = Math.PI / leastCommonMultiple(p, q);
    expect(defaultAnnularPhase(p, q)).toBeCloseTo(expectedPhase, 12);
    expect(layout.innerPhase).toBeCloseTo(expectedPhase, 12);

    const outer = layout.vertices.filter(({ boundary }) => boundary === "outer");
    const inner = layout.vertices.filter(({ boundary }) => boundary === "inner");
    const separations = outer.flatMap((a) => inner.map((b) => angularDistance(a.angle, b.angle)));
    expect(Math.min(...separations)).toBeCloseTo(expectedPhase, 12);
    expect(separations.every((value) => value > TOLERANCE)).toBe(true);
  });

  it("allows an explicit inner phase override", () => {
    const layout = createAnnularLayout(3, 4, { innerPhase: 0.37 });
    expect(layout.innerPhase).toBe(0.37);
    expect(annularVertex(layout, 4).angle).toBeCloseTo(-Math.PI / 2 + 0.37, 12);
  });
});
