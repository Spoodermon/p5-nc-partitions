import { describe, expect, it } from "vitest";
import { ROUTING_POLICY } from "../src/config/routingPolicy";
import {
  analyzeRoutePair,
  annularCycleFillRegions,
  annularPhaseCandidates,
  DEFAULT_HARD_CLEARANCE,
  extractAnnularEdges,
  principalThroughWinding,
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
    expect(first[0]).toBeCloseTo(-Math.PI / 6, 12);
    expect(first).toContain(Math.PI / 15);
  });

  it("reserves visible singleton loops and nests the inner two-cycle return farther out", () => {
    const result = routeAnnularPermutation(parsed("(1)(2)(3)(4 5)", 3, 2), { phaseCandidateCount: 3 });
    expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.isRoutable) return;
    expect(result.phase).toBeCloseTo(-Math.PI / 6, 12);
    const singletonRoutes = result.routes.filter((route) => route.edge.role === "singleton");
    expect(singletonRoutes).toHaveLength(3);
    for (const route of singletonRoutes) {
      expect(route.excursion).toBeGreaterThanOrEqual(0.1);
      expect(Math.abs(route.angularBias)).toBeGreaterThanOrEqual(0.16);
      expect(Math.hypot(route.route.pointAt(0.5).x - route.route.pointAt(0).x, route.route.pointAt(0.5).y - route.route.pointAt(0).y)).toBeGreaterThan(20);
    }
    const forward = result.routes.find((route) => route.edge.startLabel === 4 && route.edge.endLabel === 5);
    const returning = result.routes.find((route) => route.edge.startLabel === 5 && route.edge.endLabel === 4);
    if (!forward || !returning) throw new Error("missing inner two-cycle routes");
    const radiusAt = (route: typeof forward, t: number) => Math.hypot(route.route.pointAt(t).x - result.layout.center.x, route.route.pointAt(t).y - result.layout.center.y);
    for (const t of [0.25, 0.5, 0.75]) {
      const forwardTheta = forward.route.coverPointAt(t).theta;
      const returnTheta = returning.route.coverPointAt(1 - t).theta;
      const angularSeparation = Math.abs(Math.atan2(Math.sin(forwardTheta - returnTheta), Math.cos(forwardTheta - returnTheta)));
      expect(angularSeparation).toBeLessThan(1e-10);
      expect(radiusAt(returning, 1 - t) - radiusAt(forward, t)).toBeGreaterThan(DEFAULT_HARD_CLEARANCE);
    }
  });

  it("routes outer two-cycles as shortest-track ribbons", () => {
    const result = routeAnnularPermutation(parsed("(1 2)(3)(4)(5)", 3, 2));
    expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.isRoutable) return;
    const forward = result.routes.find((route) => route.edge.startLabel === 1 && route.edge.endLabel === 2);
    const returning = result.routes.find((route) => route.edge.startLabel === 2 && route.edge.endLabel === 1);
    if (!forward || !returning) throw new Error("missing outer two-cycle routes");
    expect(Math.abs(forward.route.angularDisplacement)).toBeLessThanOrEqual(Math.PI);
    expect(returning.route.angularDisplacement).toBeCloseTo(-forward.route.angularDisplacement, 12);
    const radiusAt = (route: typeof forward, t: number) => Math.hypot(route.route.pointAt(t).x - result.layout.center.x, route.route.pointAt(t).y - result.layout.center.y);
    for (const t of [0.25, 0.5, 0.75]) {
      const forwardTheta = forward.route.coverPointAt(t).theta;
      const returnTheta = returning.route.coverPointAt(1 - t).theta;
      const angularSeparation = Math.abs(Math.atan2(Math.sin(forwardTheta - returnTheta), Math.cos(forwardTheta - returnTheta)));
      expect(angularSeparation).toBeLessThan(1e-10);
      expect(radiusAt(returning, 1 - t) - radiusAt(forward, t)).toBeGreaterThan(DEFAULT_HARD_CLEARANCE);
    }
  });

  it("reverses each nontrivial boundary-cycle return along its forward chain", () => {
    const result = routeAnnularPermutation(parsed("(1 2 3 4)(5 6 7)", 4, 3));
    expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.isRoutable) return;
    const outer = result.routes.filter((route) => route.edge.cycleIndex === 0);
    const inner = result.routes.filter((route) => route.edge.cycleIndex === 1);
    expect(outer).toHaveLength(4);
    expect(inner).toHaveLength(3);
    expect(outer.filter((route) => route.edge.role === "forward").every((route) => route.route.angularDisplacement > 0)).toBe(true);
    expect(inner.filter((route) => route.edge.role === "forward").every((route) => route.route.angularDisplacement < 0)).toBe(true);
    expect(outer.find((route) => route.edge.role === "return")?.route.angularDisplacement).toBeLessThan(0);
    expect(inner.find((route) => route.edge.startLabel === 7 && route.edge.endLabel === 5)?.route.angularDisplacement).toBeGreaterThan(0);
    expect(outer.reduce((sum, route) => sum + route.route.angularDisplacement, 0)).toBeCloseTo(0, 10);
    expect(inner.reduce((sum, route) => sum + route.route.angularDisplacement, 0)).toBeCloseTo(0, 10);
  });

  it("keeps an omitted inner singleton outside a four-cycle return ribbon", () => {
    const result = routeAnnularPermutation(parsed("(1)(2)(3)(4 5 6 7)(8)", 3, 5));
    expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.isRoutable) return;
    const cycle = result.routes.filter((route) => route.edge.cycleIndex === 3);
    const forwardTravel = cycle
      .filter((route) => route.edge.role === "forward")
      .reduce((sum, route) => sum + route.route.angularDisplacement, 0);
    const returning = cycle.find((route) => route.edge.startLabel === 7 && route.edge.endLabel === 4);
    expect(forwardTravel).toBeLessThan(0);
    expect(returning?.route.angularDisplacement).toBeCloseTo(-forwardTravel, 10);
    expect(returning?.route.angularDisplacement).toBeGreaterThan(0);
  });

  it("routes a non-contiguous inner-cycle return clockwise", () => {
    const result = routeAnnularPermutation(parsed("(1 6)(2 3 4 5)(7)(8)(9)(10)(11 13 16)(12)(14)(15)(17)", 10, 7));
    expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.isRoutable) return;
    const returning = result.routes.find((route) => route.edge.startLabel === 16 && route.edge.endLabel === 11);
    expect(returning?.edge.role).toBe("return");
    expect(returning?.route.angularDisplacement).toBeGreaterThan(0);
  });

  it("closes a short contiguous inner cycle across its occupied interval", () => {
    const result = routeAnnularPermutation(parsed("(1 5)(2 4)(3)(6)(7 8 9)(10)", 5, 5));
    expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.isRoutable) return;
    const returning = result.routes.find((route) => route.edge.startLabel === 9 && route.edge.endLabel === 7);
    expect(returning?.edge.role).toBe("return");
    expect(returning?.route.angularDisplacement).toBeGreaterThan(0);
    expect(returning?.route.pointAt(0.5).y, JSON.stringify({
      phase: result.phase,
      start: returning?.route.startLiftAngle,
      end: returning?.route.endLiftAngle,
      displacement: returning?.route.angularDisplacement,
      midpoint: returning?.route.coverPointAt(0.5),
    })).toBeGreaterThan(result.layout.center.y);
  });

  it("keeps a non-contiguous outer return on its principal closing interval", () => {
    const result = routeAnnularPermutation(parsed("(1 3 5)(2)(4)(6 7)(8)(9)(10)(11 13)(12)", 9, 4));
    expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.isRoutable) return;
    const returning = result.routes.find((route) => route.edge.startLabel === 5 && route.edge.endLabel === 1);
    expect(returning?.edge.role).toBe("return");
    expect(returning?.route.angularDisplacement).toBeLessThan(0);
    expect(Math.abs(returning?.route.angularDisplacement ?? Infinity)).toBeLessThan(Math.PI);
  });

  it("builds a positive-area fill region for every routed cycle shape", () => {
    for (const [text, p, q] of [
      ["(1)(2)", 1, 1],
      ["(1 2)", 1, 1],
      ["(1 2 3 4)(5 6 7)", 4, 3],
      ["(1)(2 3)(4 5 6 7)", 4, 3],
    ] as const) {
      const result = routeAnnularPermutation(parsed(text, p, q));
      expect(result.isRoutable, `${text}: ${JSON.stringify(result.diagnostics)}`).toBe(true);
      if (!result.isRoutable) continue;
      const regions = annularCycleFillRegions(result.routes);
      expect(regions).toHaveLength(result.corridors.length);
      expect(regions.every((region) => region.points.length >= 3 && region.area > 1)).toBe(true);
    }
  }, 30_000);

  it("routes the clearance-valid boundary/through lab matrix", () => {
    for (const [text, p, q] of [
      ["(1 2 3)(4)(5)(6)(7)", 4, 3],
      ["(1 2 3 4)(5)(6)(7)(8)", 5, 3],
      ["(1)(2)(3)(4 5 6)(7)", 3, 4],
      ["(1)(2)(3)(4 5 6 7)(8)", 3, 5],
      ["(1 4 5)(2)(3)(6)", 3, 3],
      ["(1 4 5 6)(2)(3)", 3, 3],
    ] as const) {
      const result = routeAnnularPermutation(parsed(text, p, q));
      expect(result.isRoutable, `${text}: ${JSON.stringify(result.diagnostics)}`).toBe(true);
      if (!result.isRoutable) continue;
      const regions = annularCycleFillRegions(result.routes);
      expect(regions).toHaveLength(result.corridors.length);
      expect(regions.every((region) => region.area > 1)).toBe(true);
    }
  }, 30_000);

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
    const adequatelySeparated = cubic(0.65);
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
      if (!result.isRoutable) expect(result.reason).toBe("invalid-mathematical-input");
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

  it("routes the supplied production (10,7) fixture within the large-diagram fast path", () => {
    const result = routeAnnularPermutation(parsed("(1 11)(2 3 16)(4 5 6)(7 13)(8)(9 12)(10)(14 15)(17)", 10, 7));
    expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.isRoutable) return;
    expect(result.routes).toHaveLength(17);
    expect(result.diagnostics.hardCollisionCount).toBe(0);
    expect(result.diagnostics.minimumClearance).toBeGreaterThanOrEqual(DEFAULT_HARD_CLEARANCE);
    expect(result.diagnostics.elapsedMilliseconds).toBeLessThan(2_000);
  }, 5_000);

  it("routes the formerly freezing valid (10,7) production fixture", () => {
    const result = routeAnnularPermutation(parsed("(1 3)(2)(4 6 15 16 17)(5)(7)(8 9 10)(11 12)(13 14)", 10, 7));
    expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.isRoutable) return;
    expect(result.routes).toHaveLength(17);
    expect(result.diagnostics.hardCollisionCount).toBe(0);
    expect(result.diagnostics.elapsedMilliseconds).toBeLessThan(2_000);
  }, 5_000);

  it("keeps the antipodal edge of (1 3 4) on the cycle-populated side", () => {
    const result = routeAnnularPermutation(parsed("(1 3 4)(2)(5)(6)", 4, 2));
    expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.isRoutable) return;
    const edge = result.routes.find((route) => route.edge.startLabel === 1 && route.edge.endLabel === 3);
    expect(edge).toBeDefined();
    expect(edge?.route.angularDisplacement).toBeLessThan(0);
  });

  it("never admits the reported (8,5) fixture below hard clearance", () => {
    const parsed = parseAnnularPermutation("(1 2 3)(4 6)(5)(7 8 9 12 13)(10 11)", 8, 5);
    if (!parsed.ok) throw new Error(parsed.error.kind);
    const routed = routeAnnularPermutation(parsed.value);
    if (!routed.isRoutable) {
      expect(["search-limit-exceeded", "no-route-within-routing-policy", "geometry-verification-failed"]).toContain(routed.reason);
      return;
    }
    expect(routed.diagnostics.minimumClearance).toBeGreaterThanOrEqual(DEFAULT_HARD_CLEARANCE);
    const atSeven = routed.routes.filter((route) => route.edge.startLabel === 7 || route.edge.endLabel === 7);
    expect(atSeven).toHaveLength(2);
    expect(analyzeRoutePair(atSeven[0]!, atSeven[1]!, 8).intersects).toBe(false);
  }, 15_000);

  it("scales singleton breadth to available boundary spacing in the sparse (10,7) fixture", () => {
    const fixture = parsed("(1 11 12 10)(2 17)(3 5 16)(4)(6)(7)(8)(9)(13)(14)(15)", 10, 7);
    const routed = routeAnnularPermutation(fixture);
    expect(routed.isRoutable).toBe(true);
    if (!routed.isRoutable) return;
    const singleton = routed.routes.find((route) => route.edge.startLabel === 4 && route.edge.role === "singleton");
    expect(singleton?.excursion).toBeGreaterThanOrEqual(0.18);
    expect(Math.abs(singleton?.angularBias ?? 0)).toBeGreaterThanOrEqual(0.18);
    expect(Math.abs(singleton?.angularBias ?? Infinity)).toBeLessThanOrEqual(0.24);
  }, 10_000);

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

  it("uses the principal homotopy and paired biases for direct through regressions", () => {
    expect(principalThroughWinding(0, Math.PI)).toBe(0);
    expect(principalThroughWinding(Math.PI, 0)).toBe(0);
    for (const fixture of [
      parsed("(1 2)(3 4 5)", 1, 4),
      parsed("(1 3)(2 4 5)", 1, 4),
      parsed("(1 4)(2 3 5)", 1, 4),
    ]) {
      const result = routeAnnularPermutation(fixture);
      expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
      if (!result.isRoutable) continue;
      expect(result.diagnostics.principalThroughFallbackUsed).toBe(false);
      expect(result.diagnostics.throughRoutes).toHaveLength(2);
      for (const route of result.diagnostics.throughRoutes ?? []) {
        expect(route.selectedWinding).toBe(route.principalWinding);
        expect(Math.abs(route.selectedAngularDisplacement)).toBeLessThanOrEqual(Math.PI + 1e-10);
        expect(route.excessiveAngularTravel).toBe(false);
        expect(route.routeLength).toBeGreaterThan(0);
      }
      const through = result.routes.filter((route) => route.edge.startBoundary !== route.edge.endBoundary);
      expect(through[0]?.angularBias).toBeCloseTo(-(through[1]?.angularBias ?? Number.NaN), 12);
    }
  });

  it("routes the Mingo–Nica fixture without hard collisions", () => {
    const result = routeAnnularPermutation(parsed("(1 8)(2)(3 4 7)(5 6)", 5, 3));
    expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
    if (result.isRoutable) expect(result.diagnostics.hardCollisionCount).toBe(0);
  }, 20_000);

  it("uses the principal class or truthfully marks an unproven fallback for the through four-cycle stress case", () => {
    const created = annularPermutationFromImages(1, 4, [4, 3, 1, 2, 5]);
    if (!created.ok) throw new Error(created.error.kind);
    const result = routeAnnularPermutation(created.value, { phaseCandidateCount: 9, sampleCount: 25, maxSearchNodes: 2_000 });
    expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
    if (result.isRoutable) {
      expect(result.diagnostics.hardCollisionCount).toBe(0);
      expect(result.diagnostics.minimumClearance).toBeGreaterThanOrEqual(DEFAULT_HARD_CLEARANCE);
      if (result.diagnostics.principalThroughFallbackUsed) {
        expect(result.diagnostics.principalSearchProof).toBe("not-proven");
        expect(result.diagnostics.throughRoutes?.some((route) => route.selectedWinding !== route.principalWinding)).toBe(true);
        expect(result.diagnostics.throughRoutes?.every((route) => !route.principalClassProvenInfeasible)).toBe(true);
      } else {
        expect(result.diagnostics.principalSearchProof).toBe("feasible");
        expect(result.diagnostics.throughRoutes?.every((route) => route.selectedWinding === route.principalWinding)).toBe(true);
      }
    }
  }, 30_000);

  it("preserves the crowded (1,4) singleton fixtures", () => {
    for (const images of [[3, 1, 4, 2, 5], [3, 4, 1, 2, 5], [4, 2, 5, 1, 3], [1, 2, 5, 4, 3]]) {
      const created = annularPermutationFromImages(1, 4, images);
      if (!created.ok) throw new Error(created.error.kind);
      let result = routeAnnularPermutation(created.value, {
        phaseCandidateCount: 2,
        sampleCount: 25,
        maxCandidatesPerEdge: ROUTING_POLICY.maximumCandidatesPerEdge,
        maxSearchNodes: 2_000,
      });
      if (!result.isRoutable) result = routeAnnularPermutation(created.value, { maxSearchNodes: 2_000 });
      expect(result.isRoutable, `${images.join(",")}: ${JSON.stringify(result.diagnostics)}`).toBe(true);
      if (result.isRoutable) for (const singleton of result.routes.filter((route) => route.edge.role === "singleton")) {
        expect(Math.abs(singleton.angularBias)).toBeGreaterThanOrEqual(0.08);
        const start = singleton.route.pointAt(0);
        const maximumDisplacement = Math.max(...[0.25, 0.5, 0.75].map((t) => Math.hypot(singleton.route.pointAt(t).x - start.x, singleton.route.pointAt(t).y - start.y)));
        expect(maximumDisplacement).toBeGreaterThan(10);
      }
    }
  }, 30_000);

  it("preserves the crowded (4,1) singleton fixtures", () => {
    for (const images of [
      [1, 3, 5, 2, 4], [1, 4, 5, 2, 3], [1, 5, 4, 2, 3], [2, 4, 3, 5, 1],
      [2, 5, 1, 4, 3], [3, 2, 1, 5, 4], [3, 2, 4, 5, 1], [3, 2, 5, 1, 4],
      [3, 5, 1, 4, 2], [5, 3, 1, 4, 2], [5, 4, 3, 2, 1], [5, 4, 3, 1, 2],
    ]) {
      const created = annularPermutationFromImages(4, 1, images);
      if (!created.ok) throw new Error(created.error.kind);
      let result = routeAnnularPermutation(created.value, {
        phaseCandidateCount: 2,
        sampleCount: 25,
        maxCandidatesPerEdge: ROUTING_POLICY.maximumCandidatesPerEdge,
        maxSearchNodes: 2_000,
      });
      if (!result.isRoutable) result = routeAnnularPermutation(created.value, { maxSearchNodes: 2_000 });
      expect(result.isRoutable, `${images.join(",")}: ${JSON.stringify(result.diagnostics)}`).toBe(true);
      if (result.isRoutable) for (const singleton of result.routes.filter((route) => route.edge.role === "singleton")) {
        expect(singleton.excursion).toBeGreaterThanOrEqual(0.03);
        expect(Math.abs(singleton.angularBias)).toBeGreaterThanOrEqual(0.08);
      }
    }
  }, 120_000);

  it("preserves the mixed (2,3) through-cycle fallback", () => {
    const created = annularPermutationFromImages(2, 3, [2, 5, 3, 1, 4]);
    if (!created.ok) throw new Error(created.error.kind);
    const result = routeAnnularPermutation(created.value, { phaseCandidateCount: 2, sampleCount: 25, maxCandidatesPerEdge: ROUTING_POLICY.maximumCandidatesPerEdge, maxSearchNodes: 2_000 });
    expect(result.isRoutable, JSON.stringify(result.diagnostics)).toBe(true);
    if (result.isRoutable) {
      expect(result.diagnostics.hardCollisionCount).toBe(0);
      expect(result.diagnostics.minimumClearance).toBeGreaterThanOrEqual(DEFAULT_HARD_CLEARANCE);
    }
  }, 30_000);

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

});
