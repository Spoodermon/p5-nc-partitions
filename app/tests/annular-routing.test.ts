import { describe, expect, it } from "vitest";
import {
  analyzeRoutePair,
  annularPhaseCandidates,
  DEFAULT_HARD_CLEARANCE,
  extractAnnularEdges,
  routeAnnularPermutation,
  routesConflict,
  segmentDistance,
  serializeRoutedAnnularDiagram,
} from "../src/geometry/annular-routing";
import { createAnnularLayout, createAnnularRoute, createCoverCubicAnnularRoute, sampleAnnularRoute, type AnnularRoute } from "../src/geometry/annular";
import { annularPermutationFromImages, isAnnularNoncrossing, parseAnnularPermutation } from "../src/math";
import { permutationImages } from "./helpers/permutations";

function parsed(text: string, p: number, q: number) {
  const result = parseAnnularPermutation(text, p, q);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

describe("global annular routing", () => {
  it("extracts directed edges with stable cycle metadata and return roles", () => {
    const edges = extractAnnularEdges(parsed("(1 4 2)(3)", 3, 1));
    expect(edges.map((edge) => [edge.startLabel, edge.endLabel, edge.role])).toEqual([
      [1, 4, "forward"], [4, 2, "forward"], [2, 1, "return"], [3, 3, "singleton"],
    ]);
  });

  it("searches a bounded deterministic phase set containing the NCV-4 default", () => {
    const first = annularPhaseCandidates(5, 3);
    expect(first).toEqual(annularPhaseCandidates(5, 3));
    expect(first).toContain(Math.PI / 15);
  });

  it("detects intersections and orders segment clearances", () => {
    const a = { x: 0, y: 0 }, b = { x: 10, y: 10 };
    expect(segmentDistance(a, b, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(0);
    const close = segmentDistance(a, { x: 10, y: 0 }, { x: 0, y: 2 }, { x: 10, y: 2 });
    const far = segmentDistance(a, { x: 10, y: 0 }, { x: 0, y: 8 }, { x: 10, y: 8 });
    expect(close).toBeLessThan(far);
  });

  it("catches crossing, coincident, and near route geometry", () => {
    const layout = createAnnularLayout(4, 2);
    const edge = extractAnnularEdges(parsed("(1 3)(2)(4)(5)(6)", 4, 2))[0]!;
    const make = (route: AnnularRoute) => ({
      edge, winding: route.winding, lane: 0, excursion: route.excursion, angularBias: route.angularBias,
      route, samples: sampleAnnularRoute(route, 97), localScore: 0, key: "test",
    });
    const first = make(createAnnularRoute(layout, { startLabel: 1, endLabel: 3, excursion: 0.3 }));
    const duplicate = make(createAnnularRoute(layout, { startLabel: 1, endLabel: 3, excursion: 0.3 }));
    expect(analyzeRoutePair(first, duplicate).coincident).toBe(true);

    const start = layout.vertices[0]!.angle;
    const end = layout.vertices[2]!.angle;
    const cubic = (u: number) => make(createCoverCubicAnnularRoute(layout, {
      startLabel: 1, endLabel: 3, startLiftAngle: start, endLiftAngle: end,
      control1: { theta: start, u }, control2: { theta: end, u },
    }));
    const shallow = cubic(0.25);
    const adequatelySeparated = cubic(0.6);
    const tooClose = cubic(0.27);
    expect(analyzeRoutePair(shallow, adequatelySeparated, 24).clearance).toBeGreaterThan(DEFAULT_HARD_CLEARANCE);
    expect(routesConflict(shallow, tooClose, DEFAULT_HARD_CLEARANCE, 24)).toBe(true);
    expect(analyzeRoutePair(shallow, cubic(0.25), 24).coincident).toBe(true);

    const crossingEdge = extractAnnularEdges(parsed("(1 3)(2 4)(5)(6)", 4, 2))[2]!;
    const crossingRoute = createCoverCubicAnnularRoute(layout, {
      startLabel: 2, endLabel: 4,
      startLiftAngle: layout.vertices[1]!.angle, endLiftAngle: layout.vertices[3]!.angle,
      control1: { theta: layout.vertices[1]!.angle, u: 0.45 },
      control2: { theta: layout.vertices[3]!.angle, u: 0.45 },
    });
    const crossing = { ...make(crossingRoute), edge: crossingEdge };
    expect(analyzeRoutePair(shallow, crossing, 24).intersects).toBe(true);
  });

  it("rejects mathematically invalid input before search", () => {
    for (const text of ["(1 3 2 4)", "(1 4 2 3)"]) {
      const result = routeAnnularPermutation(parsed(text, 2, 2));
      expect(result.isRoutable).toBe(false);
      if (!result.isRoutable) expect(result.reason).toBe("not-annular-noncrossing");
    }
  });

  it("routes all 22 valid (2,2) permutations with positive clearance", () => {
    let valid = 0;
    for (const images of permutationImages(4)) {
      const created = annularPermutationFromImages(2, 2, images);
      if (!created.ok) throw new Error(created.error.kind);
      if (!isAnnularNoncrossing(created.value)) continue;
      valid += 1;
      const result = routeAnnularPermutation(created.value, { phaseCandidateCount: 5 });
      expect(result.isRoutable, images.join(",")).toBe(true);
      if (result.isRoutable) {
        expect(result.diagnostics.hardCollisionCount).toBe(0);
        expect(result.diagnostics.minimumClearance).toBeGreaterThanOrEqual(DEFAULT_HARD_CLEARANCE);
      }
    }
    expect(valid).toBe(22);
  }, 30_000);

  it("is deterministic and gives opposite directed two-cycle edges distinct routes", () => {
    const fixture = parsed("(1 3)(2)(4)", 2, 2);
    const first = routeAnnularPermutation(fixture, { phaseCandidateCount: 5 });
    const second = routeAnnularPermutation(fixture, { phaseCandidateCount: 5 });
    expect(serializeRoutedAnnularDiagram(first)).toBe(serializeRoutedAnnularDiagram(second));
    expect(first.isRoutable).toBe(true);
    if (first.isRoutable) {
      expect(first.routes[0]?.samples).not.toEqual(first.routes[1]?.samples);
    }
  });

  it("routes the Mingo–Nica fixture without hard collisions", () => {
    const result = routeAnnularPermutation(parsed("(1 8)(2)(3 4 7)(5 6)", 5, 3));
    expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
    if (result.isRoutable) expect(result.diagnostics.hardCollisionCount).toBe(0);
  }, 20_000);

  it("routes all four former (1,4) blockers with explicit corridors", () => {
    for (const fixture of [
      parsed("(1 2)(3 4 5)", 1, 4),
      parsed("(1 3)(2 4 5)", 1, 4),
      parsed("(1 4)(2 3 5)", 1, 4),
      parsed("(1 5)(2 3 4)", 1, 4),
    ]) {
      const result = routeAnnularPermutation(fixture);
      expect(result.isRoutable, `${fixture.permutation.images.join(",")}: ${JSON.stringify(result.diagnostics)}`).toBe(true);
      if (result.isRoutable) {
        expect(result.diagnostics.minimumClearance).toBeGreaterThanOrEqual(DEFAULT_HARD_CLEARANCE);
        expect(result.corridors.some((corridor) => corridor.kind === "through")).toBe(true);
        expect(result.corridors.some((corridor) => corridor.kind === "inner-collar")).toBe(true);
      }
    }
  }, 30_000);

  it("routes every valid permutation through total support five", () => {
    const table: Array<{ p: number; q: number; valid: number; routed: number; minimumClearance: number }> = [];
    for (let n = 2; n <= 5; n += 1) {
      for (let p = 1; p < n; p += 1) {
        const q = n - p;
        let valid = 0;
        let routed = 0;
        let minimumClearance = Number.POSITIVE_INFINITY;
        const failures: string[] = [];
        for (const images of permutationImages(n)) {
          const created = annularPermutationFromImages(p, q, images);
          if (!created.ok) throw new Error(created.error.kind);
          if (!isAnnularNoncrossing(created.value)) continue;
          valid += 1;
          let result = routeAnnularPermutation(created.value, {
            phaseCandidateCount: 2,
            sampleCount: 25,
            maxCandidatesPerEdge: 140,
            maxSearchNodes: 2_000,
          });
          if (!result.isRoutable) result = routeAnnularPermutation(created.value, { maxSearchNodes: 2_000 });
          if (result.isRoutable && result.diagnostics.hardCollisionCount === 0) {
            routed += 1;
            minimumClearance = Math.min(minimumClearance, result.diagnostics.minimumClearance);
          }
          else failures.push(images.join(","));
        }
        table.push({ p, q, valid, routed, minimumClearance });
        console.log("NCV-5 exhaustive pair", { p, q, valid, routed, minimumClearance });
        expect(routed, `(${p},${q}) failures: ${failures.join("; ")}`).toBe(valid);
      }
    }
    console.log("NCV-5 exhaustive routing", JSON.stringify(table));
  }, 240_000);
});
