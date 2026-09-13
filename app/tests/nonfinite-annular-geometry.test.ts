import { describe, expect, it } from "vitest";
import {
  adaptiveRouteSamples,
  analyzeRouteClearance,
  analyzeRoutePair,
  extractAnnularEdges,
  routesConflict,
  segmentDistance,
  verifyRouteSet,
  type AnnularRouteCandidate,
} from "../src/geometry/annular-routing";
import { createAnnularLayout, createAnnularRoute, sampleAnnularRoute, type AnnularRoute, type Point } from "../src/geometry/annular";
import { parseAnnularPermutation } from "../src/math";

function candidate(): AnnularRouteCandidate {
  const parsed = parseAnnularPermutation("(1 2)(3)", 2, 1);
  if (!parsed.ok) throw new Error(parsed.error.kind);
  const layout = createAnnularLayout(2, 1);
  const edge = extractAnnularEdges(parsed.value)[0]!;
  const route = createAnnularRoute(layout, { startLabel: edge.startLabel, endLabel: edge.endLabel });
  return Object.freeze({
    edge,
    winding: route.winding,
    lane: 0,
    excursion: route.excursion,
    angularBias: route.angularBias,
    route,
    samples: sampleAnnularRoute(route, 17),
    localScore: 0,
    key: "finite-candidate",
  });
}

function withSamples(base: AnnularRouteCandidate, samples: readonly Point[]): AnnularRouteCandidate {
  return Object.freeze({ ...base, samples: Object.freeze(samples) });
}

describe("nonfinite annular geometry fails closed", () => {
  it.each([
    { x: Number.NaN, y: 0 },
    { x: Number.POSITIVE_INFINITY, y: 0 },
    { x: 0, y: Number.NEGATIVE_INFINITY },
  ])("treats an invalid segment endpoint as zero clearance", (invalid) => {
    expect(segmentDistance({ x: 0, y: 0 }, invalid, { x: 0, y: 2 }, { x: 2, y: 2 })).toBe(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("reports sampled coordinate %s as a conflict", (x) => {
    const finite = candidate();
    const invalid = withSamples(finite, [{ x: 0, y: 0 }, { x, y: 1 }]);
    expect(analyzeRoutePair(finite, invalid)).toMatchObject({ clearance: 0, intersects: true });
    expect(routesConflict(finite, invalid, 8, 24)).toBe(true);
  });

  it("detects an unshared exact crossing when the requested clearance is zero", () => {
    const finite = candidate();
    const first = withSamples(finite, [{ x: 0, y: 0 }, { x: 2, y: 2 }]);
    const second = withSamples({
      ...finite,
      edge: { ...finite.edge, id: "distinct-edge", startLabel: 3, endLabel: 4 },
    }, [{ x: 0, y: 2 }, { x: 2, y: 0 }]);
    expect(routesConflict(first, second, 0, 0)).toBe(true);
  });

  it("fails closed for a single invalid route in aggregate clearance analysis", () => {
    const finite = candidate();
    const invalid = withSamples(finite, [{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }]);
    expect(analyzeRouteClearance([invalid], createAnnularLayout(2, 1), 0, 0)).toMatchObject({
      hardCollisionCount: 1,
      minimumClearance: 0,
      worstPair: null,
    });
    expect(() => analyzeRouteClearance([], createAnnularLayout(2, 1), Number.NaN, 0)).toThrow(RangeError);
  });

  it("does not throw when exported helpers receive a malformed candidate object", () => {
    const finite = candidate();
    const malformed = null as unknown as AnnularRouteCandidate;
    expect(() => analyzeRoutePair(finite, malformed)).not.toThrow();
    expect(analyzeRoutePair(finite, malformed)).toMatchObject({ clearance: 0, intersects: true });
    expect(routesConflict(finite, malformed, 0, 0)).toBe(true);
    expect(verifyRouteSet([malformed], createAnnularLayout(2, 1), 0, 0)).toEqual({ ok: false, reason: "geometry-verification-failed" });
  });

  it("rejects nonfinite endpoints, subdivision points, and thrown evaluations", () => {
    const base = candidate().route;
    const malformed = [
      { ...base, pointAt: () => ({ x: Number.NaN, y: 0 }) },
      { ...base, pointAt: (t: number) => ({ x: t, y: t === 1 ? Number.POSITIVE_INFINITY : 0 }) },
      { ...base, maximumSecondDerivative: 100, pointAt: (t: number) => ({ x: t, y: t === 0.5 ? Number.NaN : 0 }) },
      { ...base, pointAt: () => { throw new Error("malformed route"); } },
    ] satisfies readonly AnnularRoute[];
    for (const route of malformed) expect(adaptiveRouteSamples(route)).toEqual({ ok: false, reason: "geometry-verification-failed" });
  });

  it("does not verify a route whose analytical point function is nonfinite", () => {
    const layout = createAnnularLayout(2, 1);
    const finite = candidate();
    const route = { ...finite.route, pointAt: () => ({ x: Number.NaN, y: 0 }) } satisfies AnnularRoute;
    expect(verifyRouteSet([{ ...finite, route }], layout, 8, 24)).toEqual({ ok: false, reason: "geometry-verification-failed" });
  });

  it("rejects nonfinite verification thresholds and layout geometry", () => {
    const layout = createAnnularLayout(2, 1);
    expect(verifyRouteSet([], layout, Number.NaN, 24).ok).toBe(false);
    expect(verifyRouteSet([], layout, 8, Number.POSITIVE_INFINITY).ok).toBe(false);
    const malformedLayout = {
      ...layout,
      vertices: layout.vertices.map((vertex, index) => index === 0
        ? { ...vertex, labelPoint: { x: Number.NaN, y: vertex.labelPoint.y } }
        : vertex),
    };
    expect(verifyRouteSet([], malformedLayout, 8, 24).ok).toBe(false);
  });
});
