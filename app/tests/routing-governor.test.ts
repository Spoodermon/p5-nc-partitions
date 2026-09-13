import { describe, expect, it } from "vitest";
import { ROUTING_POLICY } from "../src/config/routingPolicy";
import {
  annularSeamStates,
  consumeCandidateValidationCheck,
  createCandidateGenerationBudget,
  createCycleBundleFrontier,
  createCycleCorridors,
  extractAnnularEdges,
  generateCycleBundles,
  generateRouteCandidates,
  routeAnnularPermutation,
  serializeRoutedAnnularDiagram,
  type CandidateGenerationBudget,
} from "../src/geometry/annular-routing";
import { createAnnularLayout } from "../src/geometry/annular";
import { parseAnnularPermutation } from "../src/math";

function annular(notation: string, p: number, q: number) {
  const parsed = parseAnnularPermutation(notation, p, q);
  if (!parsed.ok) throw new Error(parsed.error.kind);
  return parsed.value;
}

function cycleFixture(notation: string, p: number, q: number, cycleLength: number) {
  const value = annular(notation, p, q);
  const layout = createAnnularLayout(p, q);
  const seam = [...annularSeamStates(layout)][0]!;
  const edges = extractAnnularEdges(value);
  const corridor = createCycleCorridors(value, seam).find((candidate) => candidate.cycle.length === cycleLength)!;
  return { value, layout, seam, corridor, edges: edges.filter((edge) => edge.cycleIndex === corridor.cycleIndex) };
}

describe("call-wide annular routing governor", () => {
  it("rejects forged nonfinite generation limits before materialization", () => {
    const fixture = cycleFixture("(1)(2)", 1, 1, 1);
    const forged: CandidateGenerationBudget = {
      routeLimit: Number.NaN,
      pointLimit: Number.NaN,
      validationLimit: ROUTING_POLICY.maxBundleValidationChecks,
      materializedRoutes: 0,
      materializedPoints: 0,
      attemptedBundles: 0,
      rejectedBundles: 0,
      validationChecks: 0,
      exhausted: false,
      validationExhausted: false,
    };

    const bundles = generateCycleBundles(
      fixture.layout, fixture.seam, fixture.corridor, fixture.edges,
      ROUTING_POLICY.heuristicSampleCount, "all", 1,
      ROUTING_POLICY.hardClearance, ROUTING_POLICY.commonEndpointRadius, forged,
    );

    expect(bundles).toHaveLength(0);
    expect(forged.exhausted).toBe(true);
    expect(forged.validationExhausted).toBe(true);
    expect(forged.materializedRoutes).toBe(0);
    expect(forged.materializedPoints).toBe(0);
  });

  it("rejects forged counters that cannot arise from prior reservations", () => {
    const fixture = cycleFixture("(1)(2)", 1, 1, 1);
    const forged: CandidateGenerationBudget = {
      ...createCandidateGenerationBudget(),
      attemptedBundles: Number.MAX_SAFE_INTEGER,
    };

    const bundles = generateCycleBundles(
      fixture.layout, fixture.seam, fixture.corridor, fixture.edges,
      ROUTING_POLICY.heuristicSampleCount, "all", 1,
      ROUTING_POLICY.hardClearance, ROUTING_POLICY.commonEndpointRadius, forged,
    );

    expect(bundles).toHaveLength(0);
    expect(forged.exhausted).toBe(true);
    expect(forged.validationExhausted).toBe(true);
    expect(forged.materializedRoutes).toBe(0);
    expect(forged.materializedPoints).toBe(0);
  });

  it("keeps route and point exhaustion sticky across helper calls", () => {
    const fixture = cycleFixture("(1)(2)", 1, 1, 1);
    const budget = createCandidateGenerationBudget(1, ROUTING_POLICY.heuristicSampleCount);
    const first = generateCycleBundles(
      fixture.layout, fixture.seam, fixture.corridor, fixture.edges,
      ROUTING_POLICY.heuristicSampleCount, "all", 2,
      ROUTING_POLICY.hardClearance, ROUTING_POLICY.commonEndpointRadius, budget,
    );
    expect(first).toHaveLength(1);
    expect(budget.exhausted).toBe(true);
    const snapshot = { routes: budget.materializedRoutes, points: budget.materializedPoints, attempts: budget.attemptedBundles };

    const second = generateCycleBundles(
      fixture.layout, fixture.seam, fixture.corridor, fixture.edges,
      ROUTING_POLICY.heuristicSampleCount, "all", 1,
      ROUTING_POLICY.hardClearance, ROUTING_POLICY.commonEndpointRadius, budget,
    );
    expect(second).toHaveLength(0);
    expect({ routes: budget.materializedRoutes, points: budget.materializedPoints, attempts: budget.attemptedBundles }).toEqual(snapshot);
  });

  it("materializes a memoized cycle frontier only as its requested depth grows", () => {
    const fixture = cycleFixture("(1)(2)", 1, 1, 1);
    const budget = createCandidateGenerationBudget(10, 10 * ROUTING_POLICY.heuristicSampleCount);
    const frontier = createCycleBundleFrontier(
      fixture.layout, fixture.seam, fixture.corridor, fixture.edges,
      ROUTING_POLICY.heuristicSampleCount, "all", 4,
      ROUTING_POLICY.hardClearance, ROUTING_POLICY.commonEndpointRadius, budget,
    );

    expect(frontier.materializedSize).toBe(0);
    expect(budget.materializedRoutes).toBe(0);
    const first = frontier.take(1);
    expect(first).toHaveLength(1);
    expect(budget.materializedRoutes).toBe(1);
    expect(frontier.take(1)[0]).toBe(first[0]);
    expect(budget.materializedRoutes).toBe(1);
    const secondLayer = frontier.take(2);
    expect(secondLayer).toHaveLength(2);
    expect(secondLayer[0]).toBe(first[0]);
    expect(budget.materializedRoutes).toBe(2);
    expect(budget.materializedPoints).toBe(2 * ROUTING_POLICY.heuristicSampleCount);
  });

  it("does not pre-materialize every configured candidate before search", () => {
    const routed = routeAnnularPermutation(annular("(1)(2)", 1, 1), {
      maxCandidatesPerEdge: ROUTING_POLICY.maximumCandidatesPerEdge,
    });
    expect(routed.isRoutable).toBe(true);
    expect(routed.diagnostics.materializedRouteCandidateCount).toBe(2);
    expect(routed.diagnostics.searchedCandidateCount).toBe(2);
  });

  it("serializes every governor usage/limit pair and exhausted dimension", () => {
    const routed = routeAnnularPermutation(annular("(1)(2)", 1, 1), { maxSearchNodes: 0 });
    const serialized = JSON.parse(serializeRoutedAnnularDiagram(routed)) as {
      diagnostics: Record<string, unknown>;
    };
    expect(serialized.diagnostics).toMatchObject({
      maxSearchNodes: 0,
      searchNodes: 0,
      maxMaterializedRouteCandidates: ROUTING_POLICY.maxCallMaterializedRouteCandidates,
      materializedRouteCandidateCount: 0,
      maxMaterializedSamplePoints: ROUTING_POLICY.maxCallMaterializedSamplePoints,
      materializedSamplePointCount: 0,
      maxBundleValidationChecks: ROUTING_POLICY.maxBundleValidationChecks,
      bundleValidationChecks: 0,
      exhaustedResources: ["search-nodes"],
    });
  });

  it("meters rejected through-bundle pair work before another bundle is materialized", () => {
    const fixture = cycleFixture("(1 2)", 1, 1, 2);
    const budget = createCandidateGenerationBudget(100, 2_500, 1);
    generateCycleBundles(
      fixture.layout, fixture.seam, fixture.corridor, fixture.edges,
      ROUTING_POLICY.heuristicSampleCount, "all", ROUTING_POLICY.maximumCandidatesPerEdge,
      ROUTING_POLICY.hardClearance, ROUTING_POLICY.commonEndpointRadius, budget,
    );
    expect(budget.validationChecks).toBe(1);
    expect(budget.validationExhausted).toBe(false);
    expect(budget.attemptedBundles).toBe(1);
    expect(budget.materializedRoutes).toBe(2);
    expect(consumeCandidateValidationCheck(budget)).toBe(false);
    expect(budget.validationExhausted).toBe(true);
  });

  it("meters cross-bundle compatibility checks in the solver", () => {
    const routed = routeAnnularPermutation(annular("(1)(2)", 1, 1), {
      maxSearchNodes: 10,
      maxCandidatesPerEdge: 1,
    });
    expect(routed.isRoutable).toBe(true);
    expect(routed.diagnostics.bundleValidationChecks).toBeGreaterThan(0);
    expect(routed.diagnostics.bundleValidationChecks).toBeLessThanOrEqual(ROUTING_POLICY.maxBundleValidationChecks);
  });

  it("separates candidates examined by search from routes materialized", () => {
    const notation = `(${Array.from({ length: 20 }, (_, index) => index + 1).join(" ")})(21)`;
    const routed = routeAnnularPermutation(annular(notation, 20, 1), {
      maxSearchNodes: 1,
      maxCandidatesPerEdge: ROUTING_POLICY.maximumCandidatesPerEdge,
      sampleCount: ROUTING_POLICY.maximumRenderSampleCount,
    });
    expect(routed.isRoutable).toBe(false);
    if (!routed.isRoutable) expect(routed.reason).toBe("search-limit-exceeded");
    expect(routed.diagnostics.searchedCandidateCount).toBe(1);
    expect(routed.diagnostics.materializedRouteCandidateCount).toBe(21);
    expect(routed.diagnostics.materializedSamplePointCount).toBe(21 * ROUTING_POLICY.heuristicSampleCount);
    expect(routed.diagnostics.bundleValidationChecks).toBe(0);
  });

  it("enforces one public candidate maximum across routing and exported helpers", () => {
    const fixture = cycleFixture("(1)(2)", 1, 1, 1);
    const excessive = ROUTING_POLICY.maximumCandidatesPerEdge + 1;
    const routed = routeAnnularPermutation(fixture.value, { maxCandidatesPerEdge: excessive });
    expect(routed.isRoutable).toBe(false);
    if (!routed.isRoutable) expect(routed.reason).toBe("invalid-routing-options");
    expect(() => generateRouteCandidates(fixture.layout, fixture.edges[0]!, ROUTING_POLICY.heuristicSampleCount, excessive)).toThrow(RangeError);
    expect(() => generateCycleBundles(
      fixture.layout, fixture.seam, fixture.corridor, fixture.edges,
      ROUTING_POLICY.heuristicSampleCount, "all", excessive,
    )).toThrow(RangeError);
    const excessiveNodes = ROUTING_POLICY.maxSearchNodes + 1;
    const nodeLimited = routeAnnularPermutation(fixture.value, { maxSearchNodes: excessiveNodes });
    expect(nodeLimited.isRoutable).toBe(false);
    if (!nodeLimited.isRoutable) expect(nodeLimited.reason).toBe("invalid-routing-options");
  });

  it("reaches the valid support-five frontier before exhausting the call-wide governor", () => {
    const routed = routeAnnularPermutation(annular("(1 5 4 2 3)", 3, 2));
    expect(routed.isRoutable, JSON.stringify(routed.diagnostics)).toBe(true);
    expect(routed.diagnostics.materializedRouteCandidateCount).toBeLessThanOrEqual(ROUTING_POLICY.maxCallMaterializedRouteCandidates);
    expect(routed.diagnostics.materializedSamplePointCount).toBeLessThanOrEqual(ROUTING_POLICY.maxCallMaterializedSamplePoints);
  });
});
