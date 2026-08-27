import { ROUTING_POLICY } from "../../config/routingPolicy";
import { isAnnularNoncrossing, type AnnularPermutation } from "../../math/annular";
import { createAnnularLayout } from "../annular";
import { consumeCandidateValidationCheck, createCandidateGenerationBudget, generateCycleBundles, type CandidateGenerationBudget } from "./bundles";
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
  searchedCandidates: number;
  readonly examinedBundles: WeakSet<CycleRouteBundle>;
  readonly internalValidity: WeakMap<CycleRouteBundle, boolean>;
  readonly conflictCache: WeakMap<AnnularRouteCandidate, WeakMap<AnnularRouteCandidate, boolean>>;
  exhausted: boolean;
}

function consumeSearchNode(budget: SearchBudget): boolean {
  if (budget.consumed >= budget.limit) { budget.exhausted = true; return false; }
  budget.consumed += 1;
  if (budget.consumed >= budget.limit) budget.exhausted = true;
  return true;
}

function examineBundle(budget: SearchBudget, bundle: CycleRouteBundle): void {
  if (budget.examinedBundles.has(bundle)) return;
  budget.examinedBundles.add(bundle);
  budget.searchedCandidates += bundle.routes.length;
}

function bundleDifficulty(bundle: CycleRouteBundle): number {
  if (bundle.corridor.kind === "through") return 500 + bundle.routes.length;
  if (bundle.routes[0]?.edge.role === "singleton") return 100;
  return 300 + bundle.routes.length + bundle.corridor.nestingDepth;
}

function pairConflicts(
  first: AnnularRouteCandidate,
  second: AnnularRouteCandidate,
  hard: number,
  endpointRadius: number,
  budget: CandidateGenerationBudget,
  searchBudget?: SearchBudget,
): boolean | null {
  const cached = searchBudget?.conflictCache.get(first)?.get(second)
    ?? searchBudget?.conflictCache.get(second)?.get(first);
  if (cached !== undefined) return cached;
  if (!consumeCandidateValidationCheck(budget)) return null;
  const conflict = routesConflict(first, second, hard, endpointRadius);
  if (searchBudget) {
    let firstCache = searchBudget.conflictCache.get(first);
    if (!firstCache) {
      firstCache = new WeakMap();
      searchBudget.conflictCache.set(first, firstCache);
    }
    firstCache.set(second, conflict);
  }
  return conflict;
}

function bundleIsInternallyValid(bundle: CycleRouteBundle, hard: number, endpointRadius: number, searchBudget: SearchBudget, generationBudget: CandidateGenerationBudget): boolean {
  examineBundle(searchBudget, bundle);
  if (bundle.internallyValidated) return true;
  const cached = searchBudget.internalValidity.get(bundle);
  if (cached !== undefined) return cached;
  for (let first = 0; first < bundle.routes.length; first += 1) {
    for (let second = first + 1; second < bundle.routes.length; second += 1) {
      const conflict = pairConflicts(bundle.routes[first] as AnnularRouteCandidate, bundle.routes[second] as AnnularRouteCandidate, hard, endpointRadius, generationBudget, searchBudget);
      if (conflict === null) return false;
      if (conflict) {
        searchBudget.internalValidity.set(bundle, false);
        return false;
      }
    }
  }
  searchBudget.internalValidity.set(bundle, true);
  return true;
}

function bundleIsCompatible(
  bundle: CycleRouteBundle,
  assignedRoutes: readonly AnnularRouteCandidate[],
  hard: number,
  endpointRadius: number,
  searchBudget: SearchBudget,
  generationBudget: CandidateGenerationBudget,
): boolean {
  examineBundle(searchBudget, bundle);
  for (const route of bundle.routes) for (const assigned of assignedRoutes) {
    const conflict = pairConflicts(assigned, route, hard, endpointRadius, generationBudget, searchBudget);
    if (conflict === null || conflict) return false;
  }
  return true;
}

function solveBundleState(
  bundleSets: readonly (readonly CycleRouteBundle[])[],
  hard: number,
  endpointRadius: number,
  budget: SearchBudget,
  generationBudget: CandidateGenerationBudget,
  excludedBundles?: ReadonlySet<CycleRouteBundle>,
): StateSolution | null {
  if (budget.exhausted || generationBudget.validationExhausted) return null;
  const validatedSets: Array<readonly CycleRouteBundle[]> = [];
  for (const bundles of bundleSets) {
    const valid: CycleRouteBundle[] = [];
    for (const bundle of bundles) {
      if (excludedBundles?.has(bundle)) continue;
      if (bundleIsInternallyValid(bundle, hard, endpointRadius, budget, generationBudget)) valid.push(bundle);
      if (generationBudget.validationExhausted) return null;
    }
    validatedSets.push(Object.freeze(valid));
  }
  const ordered = validatedSets
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
        bundleIsCompatible(bundle, assignedRoutes, hard, endpointRadius, budget, generationBudget));
      if (generationBudget.validationExhausted) return;
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

function solveGreedyBundleState(bundleSets: readonly (readonly CycleRouteBundle[])[], hard: number, endpointRadius: number, budget: SearchBudget, generationBudget: CandidateGenerationBudget): StateSolution | null {
  if (budget.exhausted || generationBudget.validationExhausted) return null;
  const startingNodes = budget.consumed;
  const bundles: CycleRouteBundle[] = [];
  const routes: AnnularRouteCandidate[] = [];
  for (const candidates of bundleSets) {
    if (!consumeSearchNode(budget)) return null;
    let selected: CycleRouteBundle | undefined;
    for (const bundle of candidates) {
      if (bundleIsInternallyValid(bundle, hard, endpointRadius, budget, generationBudget)
        && bundleIsCompatible(bundle, routes, hard, endpointRadius, budget, generationBudget)) {
        selected = bundle;
        break;
      }
      if (generationBudget.validationExhausted) return null;
    }
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
  const boundedDistance = (value: number | undefined, maximum: number = ROUTING_POLICY.maximumDistanceOption): boolean =>
    value === undefined || (Number.isFinite(value) && value >= 0 && value <= maximum);
  const boundedInteger = (value: number | undefined, minimum: number, maximum: number): boolean =>
    value === undefined || (Number.isInteger(value) && value >= minimum && value <= maximum);
  return boundedInteger(options.phaseCandidateCount, 2, ROUTING_POLICY.maximumPhaseCandidateCount)
    && boundedInteger(options.sampleCount, 2, ROUTING_POLICY.maximumRenderSampleCount)
    && boundedInteger(options.maxCandidatesPerEdge, 1, ROUTING_POLICY.maximumCandidatesPerEdge)
    && boundedInteger(options.maxSearchNodes, 0, ROUTING_POLICY.maxSearchNodes)
    && boundedDistance(options.hardClearance)
    && boundedDistance(options.commonEndpointRadius, ROUTING_POLICY.maximumCommonEndpointRadius)
    && boundedDistance(options.strokeWidth)
    && boundedDistance(options.visualGap)
    && boundedDistance(options.preferredClearance);
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
  const heuristicSampleCount = Math.min(sampleCount, ROUTING_POLICY.heuristicSampleCount);
  const maximumCandidatesPerEdge = options.maxCandidatesPerEdge ?? ROUTING_POLICY.maxCandidatesPerEdge;
  const maximumNodes = Math.max(0, Math.floor(options.maxSearchNodes ?? ROUTING_POLICY.maxSearchNodes));
  const materializationCandidateLimit = Math.min(maximumCandidatesPerEdge, Math.max(1, maximumNodes));
  const hard = options.hardClearance ?? (options.strokeWidth ?? DEFAULT_ROUTE_STROKE_WIDTH) + (options.visualGap ?? DEFAULT_VISUAL_GAP);
  const preferred = options.preferredClearance ?? DEFAULT_PREFERRED_CLEARANCE;
  const endpointRadius = options.commonEndpointRadius ?? DEFAULT_COMMON_ENDPOINT_RADIUS;
  const clearanceMargin = verificationClearanceMargin();
  const searchHard = hard + clearanceMargin;
  if (![hard, preferred, endpointRadius, searchHard].every(Number.isFinite)
    || hard > ROUTING_POLICY.maximumDistanceOption
    || preferred > ROUTING_POLICY.maximumDistanceOption
    || endpointRadius > ROUTING_POLICY.maximumCommonEndpointRadius) {
    return Object.freeze({ isRoutable: false, permutation: value, reason: "invalid-routing-options", diagnostics: Object.freeze({ ...EMPTY_METRICS, elapsedMilliseconds: performance.now() - started }) } satisfies RoutedAnnularFailure);
  }
  const budget: SearchBudget = {
    limit: maximumNodes,
    consumed: 0,
    searchedCandidates: 0,
    examinedBundles: new WeakSet(),
    internalValidity: new WeakMap(),
    conflictCache: new WeakMap(),
    exhausted: maximumNodes === 0,
  };
  const generationBudget = createCandidateGenerationBudget(
    ROUTING_POLICY.maxCallMaterializedRouteCandidates,
    ROUTING_POLICY.maxCallMaterializedSamplePoints,
    ROUTING_POLICY.maxBundleValidationChecks,
  );
  let topologicalRejections = 0; let verificationRejected = false;
  let lastVerificationFailure: ReturnType<typeof verifyRouteSet> | null = null;
  const diagnosticContract = Object.freeze({
    requestedHardClearance: hard,
    maxSearchNodes: maximumNodes,
    maxMaterializedRouteCandidates: generationBudget.routeLimit,
    maxMaterializedSamplePoints: generationBudget.pointLimit,
    maxBundleValidationChecks: generationBudget.validationLimit,
    verificationTolerance: ROUTING_POLICY.verificationTolerance,
    verificationClearanceMargin: clearanceMargin,
    verificationMaximumDepth: ROUTING_POLICY.verificationMaxDepth,
    verificationMaximumSegmentsPerRoute: ROUTING_POLICY.verificationMaxSegmentsPerRoute,
  });
  const resourceUsage = () => ({
    attemptedBundleCount: generationBudget.attemptedBundles,
    rejectedBundleCount: generationBudget.rejectedBundles,
    materializedRouteCandidateCount: generationBudget.materializedRoutes,
    materializedSamplePointCount: generationBudget.materializedPoints,
    bundleValidationChecks: generationBudget.validationChecks,
  });
  const governorExhausted = () => budget.exhausted || generationBudget.validationExhausted || generationBudget.exhausted;
  const fail = (reason: RoutedAnnularFailure["reason"], searchedPhaseCount: number, proof: "feasible" | "proven-infeasible" | "not-proven" = "not-proven"): RoutedAnnularFailure => Object.freeze({
    isRoutable: false,
    permutation: value,
    reason,
    diagnostics: Object.freeze({ ...EMPTY_METRICS, ...(lastVerificationFailure && !lastVerificationFailure.ok ? lastVerificationFailure.analysis : {}), ...diagnosticContract, ...resourceUsage(), searchedPhaseCount, searchedCandidateCount: budget.searchedCandidates, searchNodes: budget.consumed, topologicalRejections, principalSearchProof: proof, elapsedMilliseconds: performance.now() - started }),
  });
  if (budget.exhausted) return fail("search-limit-exceeded", 0, "not-proven");
  const edges = extractAnnularEdges(value);
  const phases = annularPhaseCandidates(value.p, value.q, phaseCount);
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
          Math.min(Math.max(heuristicSampleCount, 17), 33),
          "principal-only",
          materializationCandidateLimit,
          searchHard,
          endpointRadius,
          generationBudget,
        ));
        const bundleSets = reserveSandwichedSingletons(generatedBundleSets, value.p, value.q);
        let solution = solveGreedyBundleState(singletonFirst(bundleSets), searchHard, endpointRadius, budget, generationBudget);
        let verified = solution ? verifyRouteSet(solution.routes, layout, hard, endpointRadius) : null;
        if (!verified?.ok) {
          if (solution) { verificationRejected = true; lastVerificationFailure = verified; }
          solution = solveBundleState(bundleSets, searchHard, endpointRadius, budget, generationBudget);
          verified = solution ? verifyRouteSet(solution.routes, layout, hard, endpointRadius) : null;
        }
        if (!solution) { if (governorExhausted()) return fail("search-limit-exceeded", phaseIndex + 1); continue; }
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
            searchedCandidateCount: budget.searchedCandidates,
            ...diagnosticContract,
            ...resourceUsage(),
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
        Math.min(Math.max(heuristicSampleCount, 17), 33), "all", materializationCandidateLimit, searchHard, endpointRadius, generationBudget,
      ));
      const bundleSets = reserveSandwichedSingletons(generatedBundleSets, value.p, value.q);
      let solution = solveGreedyBundleState(singletonFirst(bundleSets), searchHard, endpointRadius, budget, generationBudget);
      let verified = solution ? verifyRouteSet(solution.routes, layout, hard, endpointRadius) : null;
      if (!verified?.ok) {
        if (solution) { verificationRejected = true; lastVerificationFailure = verified; }
        solution = solveBundleState(bundleSets, searchHard, endpointRadius, budget, generationBudget);
        verified = solution ? verifyRouteSet(solution.routes, layout, hard, endpointRadius) : null;
      }
      if (!solution) { if (governorExhausted()) return fail("search-limit-exceeded", fastPhases.length); continue; }
      if (!verified?.ok) { verificationRejected = true; lastVerificationFailure = verified; continue; }
      const clearance = verified.analysis;
      const throughRoutes = throughRouteDiagnostics(verified.routes);
      const selectedUsesNonPrincipal = throughRoutes.some((route) => route.selectedWinding !== route.principalWinding);
      return Object.freeze({
        isRoutable: true, permutation: value, layout, phase: layout.innerPhase,
        outerSeam: seam.outerSeam, innerSeam: seam.innerSeam, corridors,
        routes: verified.routes,
        diagnostics: Object.freeze({ ...clearance, ...diagnosticContract, ...resourceUsage(), searchedPhaseCount: fastPhases.length, searchedCandidateCount: budget.searchedCandidates, searchNodes: budget.consumed, elapsedMilliseconds: performance.now() - started, phaseScore: solution.score, routeScore: solution.score, preferredClearanceDeficit: Math.max(0, preferred - clearance.minimumClearance), topologicalRejections, principalThroughFallbackUsed: selectedUsesNonPrincipal, principalSearchProof: selectedUsesNonPrincipal ? "not-proven" : "feasible", throughRoutes }),
      } satisfies RoutedAnnularSuccess);
    }
    return fail(governorExhausted() ? "search-limit-exceeded" : verificationRejected ? "geometry-verification-failed" : "no-route-within-routing-policy", Math.min(phases.length, 2));
  }
  const candidateTiers = [...new Set([Math.min(materializationCandidateLimit, 12), materializationCandidateLimit])];
  for (const candidateTier of candidateTiers) {
    for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
      const phase = phases[phaseIndex] as number;
      const layout = createAnnularLayout(value.p, value.q, { innerPhase: phase });
      // Prefer the wrap seams first: they keep the canonical lifted order
      // contiguous for cycles using the highest-labelled boundary vertices.
      for (const seam of [...annularSeamStates(layout)].reverse()) {
        if (!seamHasPlanarPureSpans(value, seam)) { topologicalRejections += 1; continue; }
        const corridors = createCycleCorridors(value, seam);
        // Give each seam a principal attempt followed by its bounded fallback.
        // This prevents all principal phases from consuming the call budget
        // before a feasible non-principal route at an early seam is examined.
        for (const allowNonPrincipalThrough of [false, true]) {
          const bundleSets = corridors.map((corridor) => {
            const policy = corridor.kind !== "through" || allowNonPrincipalThrough ? "all" : "principal-only";
            return generateCycleBundles(layout, seam, corridor, edges.filter((edge) => edge.cycleIndex === corridor.cycleIndex), Math.max(heuristicSampleCount, 17), policy, candidateTier, searchHard, endpointRadius, generationBudget);
          });
          const verificationExcluded = new Set<CycleRouteBundle>();
          let solution: StateSolution | null = null;
          let verified: ReturnType<typeof verifyRouteSet> | null = null;
          for (let verificationAttempt = 0; verificationAttempt < candidateTier; verificationAttempt += 1) {
            solution = solveBundleState(bundleSets, searchHard, endpointRadius, budget, generationBudget, verificationExcluded);
            if (!solution) break;
            verified = verifyRouteSet(solution.routes, layout, hard, endpointRadius);
            if (verified.ok) break;
            verificationRejected = true;
            lastVerificationFailure = verified;
            const secondEdgeId = verified.analysis?.worstPair?.secondEdgeId;
            const firstEdgeId = verified.analysis?.worstPair?.firstEdgeId;
            const offending = solution.bundles.find((bundle) => bundle.routes.some((route) => route.edge.id === secondEdgeId))
              ?? solution.bundles.find((bundle) => bundle.routes.some((route) => route.edge.id === firstEdgeId))
              ?? solution.bundles[solution.bundles.length - 1];
            if (!offending || verificationExcluded.has(offending)) break;
            verificationExcluded.add(offending);
          }
          if (!solution) { if (governorExhausted()) return fail("search-limit-exceeded", phaseIndex + 1, "not-proven"); continue; }
          if (!verified?.ok) continue;
          const clearance = verified.analysis;
          const deficit = Number.isFinite(clearance.minimumClearance) ? Math.max(0, preferred - clearance.minimumClearance) : 0;
          const phaseScore = endpointPhasePenalty(value, edges, phase) + solution.score + deficit * 0.3 - Math.min(clearance.minimumClearance, preferred) * 0.03;
          const throughRoutes = throughRouteDiagnostics(verified.routes);
          const angularWarnings = throughRoutes
            .filter((route) => route.excessiveAngularTravel && !route.principalClassProvenInfeasible)
            .map((route) => `${route.edgeId} uses excessive non-principal angular travel`);
          const selectedUsesNonPrincipal = throughRoutes.some((route) => route.selectedWinding !== route.principalWinding);
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
              ...diagnosticContract,
              ...resourceUsage(),
              labelWarnings: Object.freeze([...clearance.labelWarnings, ...angularWarnings]),
              searchedPhaseCount: phaseIndex + 1,
              searchedCandidateCount: budget.searchedCandidates,
              searchNodes: budget.consumed,
              elapsedMilliseconds: performance.now() - started,
              phaseScore,
              routeScore: solution.score,
              preferredClearanceDeficit: deficit,
              topologicalRejections,
              principalThroughFallbackUsed: selectedUsesNonPrincipal,
              principalSearchProof: selectedUsesNonPrincipal ? "not-proven" : "feasible",
              throughRoutes,
            }),
          } satisfies RoutedAnnularSuccess);
        }
      }
    }
  }
  return fail(governorExhausted() ? "search-limit-exceeded" : verificationRejected ? "geometry-verification-failed" : "no-route-within-routing-policy", phases.length, "not-proven");
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
