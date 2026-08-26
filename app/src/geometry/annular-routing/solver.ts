import { ROUTING_POLICY } from "../../config/routingPolicy";
import { isAnnularNoncrossing, type AnnularPermutation } from "../../math/annular";
import { createAnnularLayout } from "../annular";
import { generateCycleBundles } from "./bundles";
import { createCycleCorridors, seamHasPlanarPureSpans } from "./corridors";
import { extractAnnularEdges } from "./edges";
import { routesConflict } from "./intersections";
import { annularPhaseCandidates, endpointPhasePenalty } from "./phase";
import { annularSeamStates } from "./seams";
import { verificationClearanceMargin, verifyRouteSet } from "./verification";
import type { AnnularRouteCandidate, CycleRouteBundle, RoutedAnnularDiagram, RoutedAnnularFailure, RoutedAnnularSuccess, RoutingMetrics, RoutingOptions, ThroughRouteDiagnostic } from "./types";

export const DEFAULT_ROUTE_STROKE_WIDTH = ROUTING_POLICY.routeStrokeWidth;
export const DEFAULT_VISUAL_GAP = ROUTING_POLICY.visualGap;
export const DEFAULT_HARD_CLEARANCE = ROUTING_POLICY.hardClearance;
export const DEFAULT_PREFERRED_CLEARANCE = ROUTING_POLICY.preferredClearance;
export const DEFAULT_COMMON_ENDPOINT_RADIUS = ROUTING_POLICY.commonEndpointRadius;

const EMPTY_METRICS: RoutingMetrics = Object.freeze({ hardCollisionCount: 0, minimumClearance: Number.POSITIVE_INFINITY, worstPair: null, labelWarnings: Object.freeze([]), searchedPhaseCount: 0, searchedCandidateCount: 0, searchNodes: 0, elapsedMilliseconds: 0, phaseScore: Number.POSITIVE_INFINITY, routeScore: Number.POSITIVE_INFINITY, preferredClearanceDeficit: 0, topologicalRejections: 0, principalThroughFallbackUsed: false, throughRoutes: Object.freeze([]) });

interface StateSolution {
  readonly routes: readonly AnnularRouteCandidate[];
  readonly bundles: readonly CycleRouteBundle[];
  readonly score: number;
  readonly nodes: number;
}

interface SearchBudget {
  readonly limit: number;
  consumed: number;
  exhausted: boolean;
}

function consumeSearchNode(budget: SearchBudget): boolean {
  if (budget.consumed >= budget.limit) { budget.exhausted = true; return false; }
  budget.consumed += 1;
  return true;
}

function bundleDifficulty(bundle: CycleRouteBundle): number {
  if (bundle.corridor.kind === "through") return 500 + bundle.routes.length;
  if (bundle.routes[0]?.edge.role === "singleton") return 100;
  return 300 + bundle.routes.length + bundle.corridor.nestingDepth;
}

function bundleIsInternallyValid(bundle: CycleRouteBundle, hard: number, endpointRadius: number): boolean {
  for (let first = 0; first < bundle.routes.length; first += 1) {
    for (let second = first + 1; second < bundle.routes.length; second += 1) {
      if (routesConflict(bundle.routes[first] as AnnularRouteCandidate, bundle.routes[second] as AnnularRouteCandidate, hard, endpointRadius)) return false;
    }
  }
  return true;
}

function solveBundleState(
  bundleSets: readonly (readonly CycleRouteBundle[])[],
  hard: number,
  endpointRadius: number,
  budget: SearchBudget,
): StateSolution | null {
  const ordered = bundleSets
    .map((bundles) => Object.freeze(bundles.filter((bundle) => bundleIsInternallyValid(bundle, hard, endpointRadius))))
    .sort((a, b) => {
      const firstA = a[0]; const firstB = b[0];
      if (!firstA || !firstB) return a.length - b.length;
      return a.length - b.length || bundleDifficulty(firstB) - bundleDifficulty(firstA) || firstA.cycleIndex - firstB.cycleIndex;
    });
  if (ordered.some((bundles) => bundles.length === 0)) return null;
  const assignedBundles: CycleRouteBundle[] = [];
  const assignedRoutes: AnnularRouteCandidate[] = [];
  const startingNodes = budget.consumed;
  let result: StateSolution | null = null;
  const visit = (remaining: readonly number[], score: number): void => {
    if (result || !consumeSearchNode(budget)) return;
    if (remaining.length === 0) {
      const routes = Object.freeze([...assignedRoutes].sort((a, b) => a.edge.cycleIndex - b.edge.cycleIndex || a.edge.edgeIndex - b.edge.edgeIndex));
      result = Object.freeze({ routes, bundles: Object.freeze([...assignedBundles]), score, nodes: budget.consumed - startingNodes });
      return;
    }
    let selectedPosition = 0;
    let compatible: readonly CycleRouteBundle[] = [];
    for (let position = 0; position < remaining.length; position += 1) {
      const bundles = (ordered[remaining[position] as number] ?? []).filter((bundle) =>
        bundle.routes.every((route) => assignedRoutes.every((assigned) => !routesConflict(assigned, route, hard, endpointRadius))));
      if (position === 0 || bundles.length < compatible.length) {
        selectedPosition = position;
        compatible = bundles;
      }
      if (compatible.length === 0) return;
    }
    const nextRemaining = remaining.filter((_, position) => position !== selectedPosition);
    for (const bundle of compatible) {
      assignedBundles.push(bundle); assignedRoutes.push(...bundle.routes);
      visit(nextRemaining, score + bundle.score);
      assignedRoutes.splice(assignedRoutes.length - bundle.routes.length, bundle.routes.length); assignedBundles.pop();
      if (result) return;
    }
  };
  visit(ordered.map((_, index) => index), 0);
  return result;
}

function solveGreedyBundleState(bundleSets: readonly (readonly CycleRouteBundle[])[], hard: number, endpointRadius: number, budget: SearchBudget): StateSolution | null {
  const startingNodes = budget.consumed;
  const bundles: CycleRouteBundle[] = [];
  const routes: AnnularRouteCandidate[] = [];
  for (const candidates of bundleSets) {
    if (!consumeSearchNode(budget)) return null;
    const selected = candidates.find((bundle) => bundleIsInternallyValid(bundle, hard, endpointRadius)
      && bundle.routes.every((route) => routes.every((assigned) => !routesConflict(assigned, route, hard, endpointRadius))));
    if (!selected) return null;
    bundles.push(selected);
    routes.push(...selected.routes);
  }
  return Object.freeze({
    routes: Object.freeze([...routes].sort((a, b) => a.edge.cycleIndex - b.edge.cycleIndex || a.edge.edgeIndex - b.edge.edgeIndex)),
    bundles: Object.freeze(bundles),
    score: bundles.reduce((sum, bundle) => sum + bundle.score, 0),
    nodes: budget.consumed - startingNodes,
  });
}

function singletonFirst(bundleSets: readonly (readonly CycleRouteBundle[])[]): readonly (readonly CycleRouteBundle[])[] {
  return [...bundleSets].sort((a, b) => {
    const aSingleton = a[0]?.routes[0]?.edge.role === "singleton" ? 0 : 1;
    const bSingleton = b[0]?.routes[0]?.edge.role === "singleton" ? 0 : 1;
    return aSingleton - bSingleton;
  });
}

function reserveSandwichedSingletons(
  bundleSets: readonly (readonly CycleRouteBundle[])[],
  p: number,
  q: number,
): readonly (readonly CycleRouteBundle[])[] {
  const throughCycles = bundleSets.flatMap((bundles) => bundles[0]?.corridor.kind === "through" ? [new Set(bundles[0].corridor.cycle)] : []);
  return bundleSets.map((bundles) => {
    const edge = bundles[0]?.routes[0]?.edge;
    if (!edge || edge.role !== "singleton") return bundles;
    const start = edge.startBoundary === "outer" ? 1 : p + 1;
    const size = edge.startBoundary === "outer" ? p : q;
    const offset = edge.startLabel - start;
    const previous = start + ((offset - 1 + size) % size);
    const next = start + ((offset + 1) % size);
    if (!throughCycles.some((cycle) => cycle.has(previous) && cycle.has(next))) return bundles;
    const spacious = bundles.filter((bundle) => Math.abs(bundle.routes[0]?.excursion ?? 0) >= 0.18);
    return spacious.length > 0 ? spacious : bundles;
  });
}

function routingOptionsAreValid(options: RoutingOptions): boolean {
  const finiteNonnegative = (value: number | undefined): boolean => value === undefined || (Number.isFinite(value) && value >= 0);
  const boundedInteger = (value: number | undefined, minimum: number, maximum: number): boolean =>
    value === undefined || (Number.isInteger(value) && value >= minimum && value <= maximum);
  return boundedInteger(options.phaseCandidateCount, 2, 65)
    && boundedInteger(options.sampleCount, 2, 4_097)
    && boundedInteger(options.maxCandidatesPerEdge, 1, 10_000)
    && boundedInteger(options.maxSearchNodes, 0, 1_000_000)
    && finiteNonnegative(options.hardClearance)
    && finiteNonnegative(options.commonEndpointRadius)
    && finiteNonnegative(options.strokeWidth)
    && finiteNonnegative(options.visualGap)
    && finiteNonnegative(options.preferredClearance);
}

function throughRouteDiagnostics(routes: readonly AnnularRouteCandidate[]): readonly ThroughRouteDiagnostic[] {
  return Object.freeze(routes.flatMap((route) => {
    if (route.principalWinding === undefined || route.principalAngularDisplacement === undefined) return [];
    const selectedAngularDisplacement = route.route.angularDisplacement;
    return [Object.freeze({
      edgeId: route.edge.id,
      principalWinding: route.principalWinding,
      selectedWinding: route.winding,
      principalAngularDisplacement: route.principalAngularDisplacement,
      selectedAngularDisplacement,
      routeLength: route.routeLength ?? 0,
      principalClassProvenInfeasible: false,
      excessiveAngularTravel: Math.abs(selectedAngularDisplacement) > Math.abs(route.principalAngularDisplacement) + Math.PI / 2,
    })];
  }));
}

export function routeAnnularPermutation(value: AnnularPermutation, options: RoutingOptions = {}): RoutedAnnularDiagram {
  const started = performance.now();
  if (!isAnnularNoncrossing(value)) return Object.freeze({ isRoutable: false, permutation: value, reason: "invalid-mathematical-input", diagnostics: Object.freeze({ ...EMPTY_METRICS, elapsedMilliseconds: performance.now() - started }) } satisfies RoutedAnnularFailure);
  if (!routingOptionsAreValid(options)) return Object.freeze({ isRoutable: false, permutation: value, reason: "invalid-routing-options", diagnostics: Object.freeze({ ...EMPTY_METRICS, elapsedMilliseconds: performance.now() - started }) } satisfies RoutedAnnularFailure);
  const phaseCount = options.phaseCandidateCount ?? ROUTING_POLICY.phaseCandidateCount;
  const sampleCount = options.sampleCount ?? ROUTING_POLICY.renderSampleCount;
  const maximumCandidatesPerEdge = options.maxCandidatesPerEdge ?? ROUTING_POLICY.maxCandidatesPerEdge;
  const maximumNodes = Math.max(0, Math.floor(options.maxSearchNodes ?? ROUTING_POLICY.maxSearchNodes));
  const hard = options.hardClearance ?? (options.strokeWidth ?? DEFAULT_ROUTE_STROKE_WIDTH) + (options.visualGap ?? DEFAULT_VISUAL_GAP);
  const preferred = options.preferredClearance ?? DEFAULT_PREFERRED_CLEARANCE;
  const endpointRadius = options.commonEndpointRadius ?? DEFAULT_COMMON_ENDPOINT_RADIUS;
  const clearanceMargin = verificationClearanceMargin();
  const searchHard = hard + clearanceMargin;
  if (![hard, preferred, endpointRadius, searchHard].every(Number.isFinite)) return Object.freeze({ isRoutable: false, permutation: value, reason: "invalid-routing-options", diagnostics: Object.freeze({ ...EMPTY_METRICS, elapsedMilliseconds: performance.now() - started }) } satisfies RoutedAnnularFailure);
  const budget: SearchBudget = { limit: maximumNodes, consumed: 0, exhausted: maximumNodes === 0 };
  const edges = extractAnnularEdges(value);
  const phases = annularPhaseCandidates(value.p, value.q, phaseCount);
  let searchedCandidates = 0; let topologicalRejections = 0; let verificationRejected = false;
  let lastVerificationFailure: ReturnType<typeof verifyRouteSet> | null = null;
  const diagnosticContract = Object.freeze({
    requestedHardClearance: hard,
    maxSearchNodes: maximumNodes,
    verificationTolerance: ROUTING_POLICY.verificationTolerance,
    verificationClearanceMargin: clearanceMargin,
    verificationMaximumDepth: ROUTING_POLICY.verificationMaxDepth,
    verificationMaximumSegmentsPerRoute: ROUTING_POLICY.verificationMaxSegmentsPerRoute,
  });
  const fail = (reason: RoutedAnnularFailure["reason"], searchedPhaseCount: number, proof: "feasible" | "proven-infeasible" | "not-proven" = "not-proven"): RoutedAnnularFailure => Object.freeze({
    isRoutable: false,
    permutation: value,
    reason,
    diagnostics: Object.freeze({ ...EMPTY_METRICS, ...(lastVerificationFailure && !lastVerificationFailure.ok ? lastVerificationFailure.analysis : {}), ...diagnosticContract, searchedPhaseCount, searchedCandidateCount: searchedCandidates, searchNodes: budget.consumed, topologicalRejections, principalSearchProof: proof, elapsedMilliseconds: performance.now() - started }),
  });
  // Large admitted diagrams need a deliberately narrow production path before
  // the exhaustive seam search. The principal bundles already encode the
  // coherent cover lifts; a small deterministic backtrack finds the natural
  // planar drawing quickly and prevents per-seam budgets multiplying into a
  // minutes-long UI-thread stall.
  if (value.p + value.q >= 12) {
    let attemptedSeams = 0;
    const fastPhases = [0, ...phases.filter((phase) => Math.abs(phase) > 1e-12)];
    for (let phaseIndex = 0; phaseIndex < fastPhases.length && attemptedSeams < 12; phaseIndex += 1) {
      const phase = fastPhases[phaseIndex] as number;
      const layout = createAnnularLayout(value.p, value.q, { innerPhase: phase });
      for (const seam of [...annularSeamStates(layout)].reverse()) {
        if (attemptedSeams >= 12) break;
        attemptedSeams += 1;
        if (!seamHasPlanarPureSpans(value, seam)) { topologicalRejections += 1; continue; }
        const corridors = createCycleCorridors(value, seam);
        const generatedBundleSets = corridors.map((corridor) => generateCycleBundles(
          layout,
          seam,
          corridor,
          edges.filter((edge) => edge.cycleIndex === corridor.cycleIndex),
          Math.min(Math.max(sampleCount, 17), 33),
          "principal-only",
          maximumCandidatesPerEdge,
          searchHard,
          endpointRadius,
        ));
        const bundleSets = reserveSandwichedSingletons(generatedBundleSets, value.p, value.q);
        searchedCandidates += bundleSets.reduce((sum, bundles) => sum + bundles.length, 0);
        let solution = solveGreedyBundleState(singletonFirst(bundleSets), searchHard, endpointRadius, budget);
        let verified = solution ? verifyRouteSet(solution.routes, layout, hard, endpointRadius) : null;
        if (!verified?.ok) {
          if (solution) { verificationRejected = true; lastVerificationFailure = verified; }
          solution = solveBundleState(bundleSets, searchHard, endpointRadius, budget);
          verified = solution ? verifyRouteSet(solution.routes, layout, hard, endpointRadius) : null;
        }
        if (!solution) { if (budget.exhausted) return fail("search-limit-exceeded", phaseIndex + 1); continue; }
        if (!verified?.ok) { verificationRejected = true; lastVerificationFailure = verified; continue; }
        const clearance = verified.analysis;
        const deficit = Number.isFinite(clearance.minimumClearance) ? Math.max(0, preferred - clearance.minimumClearance) : 0;
        const throughRoutes = throughRouteDiagnostics(verified.routes);
        return Object.freeze({
          isRoutable: true,
          permutation: value,
          layout,
          phase: layout.innerPhase,
          outerSeam: seam.outerSeam,
          innerSeam: seam.innerSeam,
          corridors,
          routes: verified.routes,
          diagnostics: Object.freeze({
            ...clearance,
            searchedPhaseCount: phaseIndex + 1,
            searchedCandidateCount: searchedCandidates,
            ...diagnosticContract,
            searchNodes: budget.consumed,
            elapsedMilliseconds: performance.now() - started,
            phaseScore: endpointPhasePenalty(value, edges, phase) + solution.score + deficit * 0.3,
            routeScore: solution.score,
            preferredClearanceDeficit: deficit,
            topologicalRejections,
            principalThroughFallbackUsed: false,
            throughRoutes,
            principalSearchProof: "feasible",
          }),
        } satisfies RoutedAnnularSuccess);
      }
    }
    // A few admitted large diagrams require a non-principal lift. Keep this
    // fallback deliberately compact: one phase, the wrap-adjacent seams, and
    // bounded candidates. This covers the larger through-cycle fixtures while
    // preserving a predictable production latency ceiling.
    const layout = createAnnularLayout(value.p, value.q, { innerPhase: 0 });
    for (const seam of [...annularSeamStates(layout)].reverse().slice(0, 6)) {
      if (!seamHasPlanarPureSpans(value, seam)) continue;
      const corridors = createCycleCorridors(value, seam);
      const generatedBundleSets = corridors.map((corridor) => generateCycleBundles(
        layout, seam, corridor,
        edges.filter((edge) => edge.cycleIndex === corridor.cycleIndex),
        Math.min(Math.max(sampleCount, 17), 33), "all", Math.min(maximumCandidatesPerEdge * 2, 280), searchHard, endpointRadius,
      ));
      const bundleSets = reserveSandwichedSingletons(generatedBundleSets, value.p, value.q);
      searchedCandidates += bundleSets.reduce((sum, bundles) => sum + bundles.length, 0);
      let solution = solveGreedyBundleState(singletonFirst(bundleSets), searchHard, endpointRadius, budget);
      let verified = solution ? verifyRouteSet(solution.routes, layout, hard, endpointRadius) : null;
      if (!verified?.ok) {
        if (solution) { verificationRejected = true; lastVerificationFailure = verified; }
        solution = solveBundleState(bundleSets, searchHard, endpointRadius, budget);
        verified = solution ? verifyRouteSet(solution.routes, layout, hard, endpointRadius) : null;
      }
      if (!solution) { if (budget.exhausted) return fail("search-limit-exceeded", fastPhases.length); continue; }
      if (!verified?.ok) { verificationRejected = true; lastVerificationFailure = verified; continue; }
      const clearance = verified.analysis;
      const throughRoutes = throughRouteDiagnostics(verified.routes);
      const selectedUsesNonPrincipal = throughRoutes.some((route) => route.selectedWinding !== route.principalWinding);
      return Object.freeze({
        isRoutable: true, permutation: value, layout, phase: layout.innerPhase,
        outerSeam: seam.outerSeam, innerSeam: seam.innerSeam, corridors,
        routes: verified.routes,
        diagnostics: Object.freeze({ ...clearance, ...diagnosticContract, searchedPhaseCount: fastPhases.length, searchedCandidateCount: searchedCandidates, searchNodes: budget.consumed, elapsedMilliseconds: performance.now() - started, phaseScore: solution.score, routeScore: solution.score, preferredClearanceDeficit: Math.max(0, preferred - clearance.minimumClearance), topologicalRejections, principalThroughFallbackUsed: selectedUsesNonPrincipal, principalSearchProof: selectedUsesNonPrincipal ? "not-proven" : "feasible", throughRoutes }),
      } satisfies RoutedAnnularSuccess);
    }
    return fail(budget.exhausted ? "search-limit-exceeded" : verificationRejected ? "geometry-verification-failed" : "no-route-within-routing-policy", Math.min(phases.length, 2));
  }
  for (const allowNonPrincipalThrough of [false, true]) {
    for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
      const phase = phases[phaseIndex] as number;
      const layout = createAnnularLayout(value.p, value.q, { innerPhase: phase });
      // Prefer the wrap seams first: they keep the canonical lifted order
      // contiguous for cycles using the highest-labelled boundary vertices.
      for (const seam of [...annularSeamStates(layout)].reverse()) {
        if (!seamHasPlanarPureSpans(value, seam)) { topologicalRejections += 1; continue; }
        const corridors = createCycleCorridors(value, seam);
        for (const mask of [0]) {
          const bundleSets = corridors.map((corridor) => {
            const policy = corridor.kind !== "through" || allowNonPrincipalThrough ? "all" : "principal-only";
            const candidateLimit = allowNonPrincipalThrough ? Math.min(maximumCandidatesPerEdge * 2, 280) : maximumCandidatesPerEdge;
            return generateCycleBundles(layout, seam, corridor, edges.filter((edge) => edge.cycleIndex === corridor.cycleIndex), Math.max(sampleCount, 17), policy, candidateLimit, searchHard, endpointRadius);
          });
          searchedCandidates += bundleSets.reduce((sum, bundles) => sum + bundles.length, 0);
          const solution = solveBundleState(bundleSets, searchHard, endpointRadius, budget);
          if (!solution) { if (budget.exhausted) return fail("search-limit-exceeded", phaseIndex + 1, "not-proven"); continue; }
          const verified = verifyRouteSet(solution.routes, layout, hard, endpointRadius);
          if (!verified.ok) { verificationRejected = true; lastVerificationFailure = verified; continue; }
          const clearance = verified.analysis;
          const deficit = Number.isFinite(clearance.minimumClearance) ? Math.max(0, preferred - clearance.minimumClearance) : 0;
          const phaseScore = endpointPhasePenalty(value, edges, phase) + solution.score + deficit * 0.3 - Math.min(clearance.minimumClearance, preferred) * 0.03;
          const throughRoutes = throughRouteDiagnostics(verified.routes);
          const angularWarnings = throughRoutes
            .filter((route) => route.excessiveAngularTravel && !route.principalClassProvenInfeasible)
            .map((route) => `${route.edgeId} uses excessive non-principal angular travel`);
          const selectedUsesNonPrincipal = throughRoutes.some((route) => route.selectedWinding !== route.principalWinding);
          return Object.freeze({ isRoutable: true, permutation: value, layout, phase: layout.innerPhase, outerSeam: seam.outerSeam, innerSeam: seam.innerSeam, corridors, routes: verified.routes, diagnostics: Object.freeze({ ...clearance, ...diagnosticContract, labelWarnings: Object.freeze([...clearance.labelWarnings, ...angularWarnings]), searchedPhaseCount: phaseIndex + 1, searchedCandidateCount: searchedCandidates, searchNodes: budget.consumed, elapsedMilliseconds: performance.now() - started, phaseScore, routeScore: solution.score, preferredClearanceDeficit: deficit, topologicalRejections, principalThroughFallbackUsed: selectedUsesNonPrincipal, principalSearchProof: selectedUsesNonPrincipal ? "not-proven" : "feasible", throughRoutes }) } satisfies RoutedAnnularSuccess);
        }
      }
    }
  }
  return fail(verificationRejected ? "geometry-verification-failed" : "no-route-within-routing-policy", phases.length, "not-proven");
}

export function serializeRoutedAnnularDiagram(diagram: RoutedAnnularDiagram): string {
  const diagnostics = {
    outcome: diagram.isRoutable ? "success" : diagram.reason,
    requestedHardClearance: diagram.diagnostics.requestedHardClearance,
    verifiedMinimumClearance: diagram.diagnostics.minimumClearance,
    maxSearchNodes: diagram.diagnostics.maxSearchNodes,
    searchNodes: diagram.diagnostics.searchNodes,
    principalSearchProof: diagram.diagnostics.principalSearchProof,
  };
  const data = diagram.isRoutable ? { p: diagram.permutation.p, q: diagram.permutation.q, phase: Number(diagram.phase.toFixed(12)), outerSeam: diagram.outerSeam, innerSeam: diagram.innerSeam, cycles: diagram.corridors.map((corridor) => ({ cycle: `(${corridor.cycle.join(" ")})`, corridor: corridor.kind, nestingDepth: corridor.nestingDepth })), routes: diagram.routes.map((route) => ({ edge: `${route.edge.startLabel}->${route.edge.endLabel}`, winding: route.winding, principalWinding: route.principalWinding, angularDisplacement: route.route.angularDisplacement, principalAngularDisplacement: route.principalAngularDisplacement, routeLength: route.routeLength, lane: route.lane, excursion: route.excursion, angularBias: route.angularBias, routeFamily: route.routeFamily })), principalThroughFallbackUsed: diagram.diagnostics.principalThroughFallbackUsed, diagnostics } : { p: diagram.permutation.p, q: diagram.permutation.q, failure: diagram.reason, diagnostics };
  return JSON.stringify(data, null, 2);
}
