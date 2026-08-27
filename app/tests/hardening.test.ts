import { describe, expect, it } from "vitest";
import { INPUT_LIMITS, parseBoundedPositiveInteger } from "../src/config/limits";
import { ROUTING_POLICY } from "../src/config/routingPolicy";
import { adaptiveRouteSamples, analyzeRouteClearance, analyzeRoutePair, annularSeamStates, createCandidateGenerationBudget, createCycleCorridors, extractAnnularEdges, generateCycleBundles, generateRouteCandidates, routeAnnularPermutation, type AnnularRouteCandidate, type RoutedAnnularSuccess } from "../src/geometry/annular-routing";
import { createAnnularLayout, createAnnularRoute, sampleAnnularRoute, type AnnularRoute } from "../src/geometry/annular";
import { parseAnnularPermutation, parseDiscPartition, partitionToString } from "../src/math";
import { processAnnularInput, resolveCanonicalAnnularBlocks } from "../src/production/annularController";

declare const process: { memoryUsage(): { readonly rss: number } };

function annular(text: string, p: number, q: number) {
  const result = parseAnnularPermutation(text, p, q);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

function denseClearance(routed: RoutedAnnularSuccess, hardClearance: number, sampleCount = 5_001): number {
  const routes = routed.routes.map((candidate) => ({ ...candidate, samples: sampleAnnularRoute(candidate.route, sampleCount) }));
  return analyzeRouteClearance(routes, routed.layout, hardClearance, ROUTING_POLICY.commonEndpointRadius).minimumClearance;
}

describe("hostile input and supported boundaries", () => {
  it("caps raw numeric field text before normalization while preserving bounded leading-zero syntax", () => {
    const atLimit = `+${"0".repeat(INPUT_LIMITS.numericInputCharacters - 2)}1`;
    expect(atLimit).toHaveLength(INPUT_LIMITS.numericInputCharacters);
    expect(parseBoundedPositiveInteger(atLimit, INPUT_LIMITS.discSupport)).toEqual({ ok: true, value: 1 });
    expect(parseBoundedPositiveInteger(" +00020 ", INPUT_LIMITS.annularP)).toEqual({ ok: true, value: 20 });

    const aboveLimit = `+${"0".repeat(INPUT_LIMITS.numericInputCharacters - 1)}1`;
    expect(aboveLimit).toHaveLength(INPUT_LIMITS.numericInputCharacters + 1);
    expect(parseBoundedPositiveInteger(aboveLimit, INPUT_LIMITS.discSupport)).toEqual({ ok: false, reason: "input-too-long" });
    const processed = processAnnularInput(aboveLimit, "1", "");
    expect(processed.ok).toBe(false);
    if (!processed.ok) {
      expect(processed.error.kind).toBe("input-limit");
      expect(processed.error.message).toContain(`${INPUT_LIMITS.numericInputCharacters} characters`);
    }
  });

  it("round-trips a deterministic supported partition corpus", () => {
    for (const notation of ["(1)", "(1)(2)", "(1 4)(2 3)", "(1 2 3)(4)(5 6)"]) {
      const first = parseDiscPartition(notation);
      expect(first.ok).toBe(true);
      if (!first.ok) continue;
      const second = parseDiscPartition(partitionToString(first.value));
      expect(second).toEqual(first);
    }
  });

  it.each([
    "(4294967296)",
    "(999999999999999999999999999999999999999)",
    `(9007199254740991)`,
    `(9007199254740992)`,
    `(1e1000000)`,
    `(NaN)`,
    `(Infinity)`,
  ])("rejects disc token %s without throwing", (text) => {
    expect(() => parseDiscPartition(text)).not.toThrow();
    expect(parseDiscPartition(text).ok).toBe(false);
  });

  it("accepts the disc limit and rejects the next label structurally", () => {
    const atLimit = Array.from({ length: INPUT_LIMITS.discSupport }, (_, index) => `(${index + 1})`).join("");
    expect(parseDiscPartition(atLimit).ok).toBe(true);
    const above = parseDiscPartition(`(${INPUT_LIMITS.discSupport + 1})`);
    expect(above.ok).toBe(false);
    if (!above.ok) expect(above.error.kind).toBe("label-too-large");
  });

  it.each(["4294967295", "4294967296", "9007199254740991", "9007199254740992", "9".repeat(10_000)])("rejects annular boundary %s without throwing", (p) => {
    expect(() => processAnnularInput(p, "1", "")).not.toThrow();
    const result = processAnnularInput(p, "1", "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("input-limit");
  });

  it.each([
    { notation: " ".repeat(INPUT_LIMITS.inputCharacters + 1), expectedParserKind: "input-too-long" },
    { notation: `(${INPUT_LIMITS.maximumLabel + 1})`, expectedParserKind: "label-too-large" },
    { notation: `(${"9".repeat(16)})`, expectedParserKind: "unsafe-integer" },
  ])("classifies $expectedParserKind annular notation as an infrastructure limit", ({ notation, expectedParserKind }) => {
    const parsed = parseAnnularPermutation(notation, 1, 1);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.kind).toBe(expectedParserKind);
    const result = processAnnularInput("1", "1", notation);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("input-limit");
  });

  it("enforces individual and total annular limits", () => {
    expect(processAnnularInput(String(INPUT_LIMITS.annularP), "1", "").ok).toBe(true);
    expect(processAnnularInput(String(INPUT_LIMITS.annularP + 1), "1", "").ok).toBe(false);
    expect(processAnnularInput("12", "12", "").ok).toBe(true);
    expect(processAnnularInput("13", "12", "").ok).toBe(false);
  });
});

describe("bounded auto-orientation", () => {
  it("finds a natural orientation for two entered crossing seven-element supports", () => {
    const entered = annular("(1 3 5 7 2 4 6)(8 10 12 14 9 11 13)", 7, 7);
    const result = resolveCanonicalAnnularBlocks(entered);
    expect(result.status).toBe("found");
    expect(result.searchedOrientationCandidates).toBeLessThanOrEqual(result.maxOrientationCandidates);
  });

  it("stops a factorial stress search at the global budget with truthful semantics", () => {
    const entered = annular("(1 3 5 7 2 4 6)(8 10 12 14 9 11 13)", 7, 7);
    const result = resolveCanonicalAnnularBlocks(entered, 1);
    expect(result.searchedOrientationCandidates).toBeLessThanOrEqual(1);
    expect(["found", "auto-orient-search-exhausted"]).toContain(result.status);
    expect(result.status).not.toBe("no-annular-noncrossing-orientation");
  });
});

describe("truthful routing contracts", () => {
  it("rejects the former (1,4) approximation false positive and finds a densely verified route", () => {
    const routed = routeAnnularPermutation(annular("(1 4 5)(2)(3)", 1, 4), { phaseCandidateCount: 2, maxCandidatesPerEdge: 20, maxSearchNodes: 1_000 });
    expect(routed.isRoutable, routed.isRoutable ? "success" : `${routed.reason}: ${JSON.stringify(routed.diagnostics)}`).toBe(true);
    if (!routed.isRoutable) return;
    expect(routed.diagnostics.minimumClearance).toBeGreaterThanOrEqual(ROUTING_POLICY.hardClearance);
    expect(denseClearance(routed, ROUTING_POLICY.hardClearance)).toBeGreaterThanOrEqual(ROUTING_POLICY.hardClearance);
  }, 30_000);

  it("never weakens a requested hard clearance of 10", () => {
    const routed = routeAnnularPermutation(annular("(1 11)(2 3 16)(4 5 6)(7 13)(8)(9 12)(10)(14 15)(17)", 10, 7), { hardClearance: 10 });
    expect(routed.isRoutable, routed.isRoutable ? "success" : routed.reason).toBe(true);
    if (!routed.isRoutable) return;
    expect(routed.diagnostics.minimumClearance).toBeGreaterThanOrEqual(10);
  }, 20_000);

  it("keeps sampleCount=2 out of final collision truth for a (1,3) regression", () => {
    const routed = routeAnnularPermutation(annular("(1 3)(2 4)", 1, 3), { sampleCount: 2 });
    expect(routed.isRoutable, routed.isRoutable ? "success" : routed.reason).toBe(true);
    if (!routed.isRoutable) return;
    expect(routed.diagnostics.hardCollisionCount).toBe(0);
    expect(routed.diagnostics.minimumClearance).toBeGreaterThanOrEqual(ROUTING_POLICY.hardClearance);
    expect(routed.routes.every((route) => route.samples.length > 2)).toBe(true);
    expect(denseClearance(routed, ROUTING_POLICY.hardClearance, 1_001)).toBeGreaterThanOrEqual(ROUTING_POLICY.hardClearance);
  });

  it("derives principal proof state from the selected route class", () => {
    const routed = routeAnnularPermutation(annular("(1 2 5 4)(3)", 2, 3));
    expect(routed.isRoutable, routed.isRoutable ? "success" : routed.reason).toBe(true);
    if (!routed.isRoutable) return;
    expect(routed.diagnostics.throughRoutes?.every((route) => route.selectedWinding === route.principalWinding)).toBe(true);
    expect(routed.diagnostics.principalThroughFallbackUsed).toBe(false);
    expect(routed.diagnostics.principalSearchProof).toBe("feasible");
    expect(routed.diagnostics.throughRoutes?.every((route) => !route.principalClassProvenInfeasible)).toBe(true);
  });

  it.each([
    { maxSearchNodes: Number.NaN },
    { maxSearchNodes: Number.POSITIVE_INFINITY },
    { hardClearance: Number.NaN },
    { hardClearance: Number.POSITIVE_INFINITY },
    { sampleCount: Number.NaN },
    { phaseCandidateCount: Number.POSITIVE_INFINITY },
    { strokeWidth: Number.POSITIVE_INFINITY },
    { visualGap: Number.NaN },
    { strokeWidth: Number.MAX_VALUE, visualGap: Number.MAX_VALUE },
    { commonEndpointRadius: Number.MAX_VALUE },
    { hardClearance: ROUTING_POLICY.maximumDistanceOption + 1 },
    { sampleCount: ROUTING_POLICY.maximumRenderSampleCount + 1 },
    { phaseCandidateCount: ROUTING_POLICY.maximumPhaseCandidateCount + 1 },
  ])("rejects invalid numeric routing options structurally: $0", (options) => {
    const routed = routeAnnularPermutation(annular("(1)(2)", 1, 1), options);
    expect(routed.isRoutable).toBe(false);
    if (!routed.isRoutable) expect(routed.reason).toBe("invalid-routing-options");
  });

  it("rejects endpoint-radius overflow instead of clipping away hard-clearance truth", () => {
    const fixture = annular("(1 2)", 1, 1);
    const baseline = routeAnnularPermutation(fixture, { hardClearance: 100 });
    expect(baseline.isRoutable).toBe(false);
    if (!baseline.isRoutable) expect(baseline.reason).toBe("no-route-within-routing-policy");
    const routed = routeAnnularPermutation(fixture, { hardClearance: 100, commonEndpointRadius: Number.MAX_VALUE });
    expect(routed.isRoutable).toBe(false);
    if (!routed.isRoutable) expect(routed.reason).toBe("invalid-routing-options");
  });

  it("consults a zero-node governor before high-density candidate generation", () => {
    const routed = routeAnnularPermutation(
      annular("(1 2 3 4 5 6 7 8 9 10)(11)", 10, 1),
      { maxSearchNodes: 0, sampleCount: ROUTING_POLICY.maximumRenderSampleCount },
    );
    expect(routed.isRoutable).toBe(false);
    if (!routed.isRoutable) expect(routed.reason).toBe("search-limit-exceeded");
    expect(routed.diagnostics.searchNodes).toBe(0);
    expect(routed.diagnostics.searchedCandidateCount).toBe(0);
    expect(routed.diagnostics.searchedPhaseCount).toBe(0);
  });

  it("materializes only bounded candidates for a positive one-node budget", () => {
    const routed = routeAnnularPermutation(
      annular("(1 2 3 4 5 6 7 8 9 10)(11)", 10, 1),
      { maxSearchNodes: 1, maxCandidatesPerEdge: 1, sampleCount: ROUTING_POLICY.maximumRenderSampleCount },
    );
    expect(routed.isRoutable).toBe(false);
    if (!routed.isRoutable) expect(routed.reason).toBe("search-limit-exceeded");
    expect(routed.diagnostics.searchedCandidateCount).toBeLessThanOrEqual(11);
    expect(routed.diagnostics.materializedSamplePointCount).toBeLessThanOrEqual(11 * ROUTING_POLICY.maximumRenderSampleCount);
    expect(routed.diagnostics.bundleValidationChecks).toBeLessThanOrEqual(46);
  });

  it("caps actual route objects rather than multiplying bundles by cycle edges", () => {
    const notation = `(${Array.from({ length: 20 }, (_, index) => index + 1).join(" ")})(21)`;
    const value = annular(notation, 20, 1);
    const layout = createAnnularLayout(20, 1);
    const seam = [...annularSeamStates(layout)][0]!;
    const edges = extractAnnularEdges(value);
    const corridor = createCycleCorridors(value, seam).find((candidate) => candidate.cycle.length === 20)!;
    const corridorEdges = edges.filter((edge) => edge.cycleIndex === corridor.cycleIndex);
    const budget = createCandidateGenerationBudget();
    const bundles = generateCycleBundles(layout, seam, corridor, corridorEdges, 65, "all", ROUTING_POLICY.maxCandidatesPerEdge, ROUTING_POLICY.hardClearance, ROUTING_POLICY.commonEndpointRadius, budget);
    const actualRoutes = bundles.reduce((sum, bundle) => sum + bundle.routes.length, 0);
    expect(bundles.length).toBeLessThanOrEqual(ROUTING_POLICY.maxCandidatesPerEdge);
    expect(actualRoutes).toBeLessThanOrEqual(20 * ROUTING_POLICY.maxCandidatesPerEdge);
    expect(budget.materializedRoutes).toBe(actualRoutes);
    expect(budget.materializedPoints).toBe(actualRoutes * 65);
  });

  it("bounds rejected through specifications before route materialization", () => {
    const value = annular("(1 2)", 1, 1);
    const layout = createAnnularLayout(1, 1);
    const seam = [...annularSeamStates(layout)][0]!;
    const corridor = createCycleCorridors(value, seam)[0]!;
    const edges = extractAnnularEdges(value);
    const budget = createCandidateGenerationBudget();
    const bundles = generateCycleBundles(layout, seam, corridor, edges, 65, "all", 1, 1_000, 24, budget);
    expect(bundles).toHaveLength(0);
    expect(budget.attemptedBundles).toBeGreaterThan(0);
    expect(budget.attemptedBundles).toBeLessThanOrEqual(4);
    expect(budget.rejectedBundles).toBe(budget.attemptedBundles);
    expect(budget.materializedRoutes).toBe(2 * budget.attemptedBundles);
  });

  it("bounds every exported sampling and candidate helper", () => {
    const value = annular("(1 2)(3)(4)", 2, 2);
    const layout = createAnnularLayout(2, 2);
    const edges = extractAnnularEdges(value);
    const edge = edges[0]!;
    const seam = [...annularSeamStates(layout)][0]!;
    const corridor = createCycleCorridors(value, seam)[0]!;
    const corridorEdges = edges.filter((candidate) => candidate.cycleIndex === corridor.cycleIndex);
    const route = createAnnularRoute(layout, { startLabel: edge.startLabel, endLabel: edge.endLabel });
    expect(() => sampleAnnularRoute(route, ROUTING_POLICY.maximumStandaloneSampleCount + 1)).toThrow(RangeError);
    expect(() => generateRouteCandidates(layout, edge, ROUTING_POLICY.maximumRenderSampleCount + 1, 1)).toThrow(RangeError);
    expect(() => generateCycleBundles(layout, seam, corridor, corridorEdges, ROUTING_POLICY.maximumRenderSampleCount + 1, "all", 1)).toThrow(RangeError);
  });

  it("contracts endpoint exemptions by approximation tolerance", () => {
    const layout = createAnnularLayout(2, 1);
    const firstEdge = extractAnnularEdges(annular("(1 2)(3)", 2, 1))[0]!;
    const secondEdge = extractAnnularEdges(annular("(1 3)(2)", 2, 1))[0]!;
    const route = createAnnularRoute(layout, { startLabel: 1, endLabel: 2 });
    const make = (edge: typeof firstEdge, y: number): AnnularRouteCandidate => ({
      edge, winding: 0, lane: 0, excursion: route.excursion, angularBias: 0, route,
      samples: Object.freeze([{ x: 0, y: 0 }, { x: 7.9, y }]), localScore: 0, key: edge.id,
    });
    const first = make(firstEdge, 0);
    const second = make(secondEdge, 0.1);
    expect(analyzeRoutePair(first, second, 8).clearance).toBe(Number.POSITIVE_INFINITY);
    expect(analyzeRoutePair(first, second, 8, ROUTING_POLICY.verificationTolerance).clearance).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(analyzeRoutePair(first, second, 24, ROUTING_POLICY.verificationTolerance).intersects).toBe(true);
  });

  it("detects collinear contact outside the tight endpoint disk at zero tolerance", () => {
    const layout = createAnnularLayout(2, 1);
    const firstEdge = extractAnnularEdges(annular("(1 2)(3)", 2, 1))[0]!;
    const secondEdge = extractAnnularEdges(annular("(1 3)(2)", 2, 1))[0]!;
    const route = createAnnularRoute(layout, { startLabel: 1, endLabel: 2 });
    const make = (edge: typeof firstEdge): AnnularRouteCandidate => ({
      edge, winding: 0, lane: 0, excursion: route.excursion, angularBias: 0, route,
      samples: Object.freeze([{ x: 0, y: 0 }, { x: 30, y: 0 }]), localScore: 0, key: edge.id,
    });
    expect(analyzeRoutePair(make(firstEdge), make(secondEdge), 24, 0).intersects).toBe(true);
  });

  it("treats maxSearchNodes as one call-wide cap", () => {
    for (const maxSearchNodes of [0, 1]) {
      const routed = routeAnnularPermutation(annular("(1)(2)", 1, 1), { maxSearchNodes });
      expect(routed.diagnostics.searchNodes).toBeLessThanOrEqual(maxSearchNodes);
      expect(routed.diagnostics.maxSearchNodes).toBe(maxSearchNodes);
      if (!routed.isRoutable) {
        expect(routed.reason).toBe("search-limit-exceeded");
        expect(routed.diagnostics.principalSearchProof).toBe("not-proven");
      }
    }
  });

  it("adaptively subdivides high-curvature geometry within configured bounds", () => {
    const route = createAnnularRoute(createAnnularLayout(4, 2), { startLabel: 1, endLabel: 3, excursion: 0.7, angularBias: 1.1 });
    const verified = adaptiveRouteSamples(route);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.samples.length).toBeGreaterThan(2);
      expect(verified.samples.length - 1).toBeLessThanOrEqual(ROUTING_POLICY.verificationMaxSegmentsPerRoute);
    }
  });

  it("does not mistake quarter-point agreement for a whole-curve flatness bound", () => {
    const frequency = 8 * Math.PI;
    const amplitude = 10;
    const adversarial = {
      kind: "through",
      startLabel: 1,
      endLabel: 2,
      startBoundary: "outer",
      endBoundary: "inner",
      winding: 0,
      angularBias: 0,
      excursion: 0.3,
      startLiftAngle: 0,
      endLiftAngle: 0,
      angularDisplacement: 0,
      maximumSecondDerivative: amplitude * frequency * frequency,
      coverPointAt: (t: number) => ({ theta: t, u: t }),
      pointAt: (t: number) => ({ x: t, y: amplitude * Math.sin(frequency * t) }),
      tangentAt: (t: number) => ({ x: 1, y: amplitude * frequency * Math.cos(frequency * t) }),
    } satisfies AnnularRoute;
    const verified = adaptiveRouteSamples(adversarial);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.samples.length).toBeGreaterThan(8);
  });
});
