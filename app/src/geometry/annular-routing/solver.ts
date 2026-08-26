import { isAnnularNoncrossing, type AnnularPermutation } from "../../math/annular";
import { createAnnularLayout } from "../annular";
import { generateCycleBundles } from "./bundles";
import { analyzeRouteClearance } from "./clearance";
import { createCycleCorridors, seamHasPlanarPureSpans } from "./corridors";
import { extractAnnularEdges } from "./edges";
import { routesConflict } from "./intersections";
import { annularPhaseCandidates, endpointPhasePenalty } from "./phase";
import { annularSeamStates } from "./seams";
import type { AnnularRouteCandidate, CycleRouteBundle, RoutedAnnularDiagram, RoutedAnnularFailure, RoutedAnnularSuccess, RoutingMetrics, RoutingOptions, ThroughRouteDiagnostic } from "./types";

export const DEFAULT_ROUTE_STROKE_WIDTH = 4;
export const DEFAULT_VISUAL_GAP = 3.5;
export const DEFAULT_HARD_CLEARANCE = DEFAULT_ROUTE_STROKE_WIDTH + DEFAULT_VISUAL_GAP;
export const DEFAULT_PREFERRED_CLEARANCE = 14;
export const DEFAULT_COMMON_ENDPOINT_RADIUS = 24;

const EMPTY_METRICS: RoutingMetrics = Object.freeze({ hardCollisionCount: 0, minimumClearance: Number.POSITIVE_INFINITY, worstPair: null, labelWarnings: Object.freeze([]), searchedPhaseCount: 0, searchedCandidateCount: 0, searchNodes: 0, elapsedMilliseconds: 0, phaseScore: Number.POSITIVE_INFINITY, routeScore: Number.POSITIVE_INFINITY, preferredClearanceDeficit: 0, topologicalRejections: 0, principalThroughFallbackUsed: false, throughRoutes: Object.freeze([]) });

interface StateSolution {
  readonly routes: readonly AnnularRouteCandidate[];
  readonly bundles: readonly CycleRouteBundle[];
  readonly score: number;
  readonly nodes: number;
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

function solveBundleState(bundleSets: readonly (readonly CycleRouteBundle[])[], hard: number, endpointRadius: number, maxNodes: number): StateSolution | null {
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
  let nodes = 0;
  let result: StateSolution | null = null;
  const visit = (remaining: readonly number[], score: number): void => {
    if (result || nodes >= maxNodes) return;
    nodes += 1;
    if (remaining.length === 0) {
      result = Object.freeze({ routes: Object.freeze([...assignedRoutes].sort((a, b) => a.edge.cycleIndex - b.edge.cycleIndex || a.edge.edgeIndex - b.edge.edgeIndex)), bundles: Object.freeze([...assignedBundles]), score, nodes });
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

function solveGreedyBundleState(bundleSets: readonly (readonly CycleRouteBundle[])[], hard: number, endpointRadius: number): StateSolution | null {
  const bundles: CycleRouteBundle[] = [];
  const routes: AnnularRouteCandidate[] = [];
  for (const candidates of bundleSets) {
    const selected = candidates.find((bundle) => bundleIsInternallyValid(bundle, hard, endpointRadius) && bundle.routes.every((route) =>
      routes.every((assigned) => !routesConflict(assigned, route, hard, endpointRadius))));
    if (!selected) return null;
    bundles.push(selected);
    routes.push(...selected.routes);
  }
  return Object.freeze({
    routes: Object.freeze([...routes].sort((a, b) => a.edge.cycleIndex - b.edge.cycleIndex || a.edge.edgeIndex - b.edge.edgeIndex)),
    bundles: Object.freeze(bundles),
    score: bundles.reduce((sum, bundle) => sum + bundle.score, 0),
    nodes: bundleSets.length,
  });
}

export function routeAnnularPermutation(value: AnnularPermutation, options: RoutingOptions = {}): RoutedAnnularDiagram {
  const started = performance.now();
  if (!isAnnularNoncrossing(value)) return Object.freeze({ isRoutable: false, permutation: value, reason: "not-annular-noncrossing", diagnostics: Object.freeze({ ...EMPTY_METRICS, elapsedMilliseconds: performance.now() - started }) } satisfies RoutedAnnularFailure);
  const phaseCount = options.phaseCandidateCount ?? 9;
  const sampleCount = options.sampleCount ?? 65;
  const maximumCandidatesPerEdge = options.maxCandidatesPerEdge ?? 140;
  const maximumNodes = options.maxSearchNodes ?? 5_000;
  const hard = options.hardClearance ?? (options.strokeWidth ?? DEFAULT_ROUTE_STROKE_WIDTH) + (options.visualGap ?? DEFAULT_VISUAL_GAP);
  const preferred = options.preferredClearance ?? DEFAULT_PREFERRED_CLEARANCE;
  const endpointRadius = options.commonEndpointRadius ?? DEFAULT_COMMON_ENDPOINT_RADIUS;
  const edges = extractAnnularEdges(value);
  const phases = annularPhaseCandidates(value.p, value.q, phaseCount);
  let searchedCandidates = 0; let searchNodes = 0; let topologicalRejections = 0;
  // Large admitted diagrams need a deliberately narrow production path before
  // the exhaustive seam search. The principal bundles already encode the
  // coherent cover lifts; a small deterministic backtrack finds the natural
  // planar drawing quickly and prevents per-seam budgets multiplying into a
  // minutes-long UI-thread stall.
  if (value.p + value.q >= 12) {
    const fastNodeLimit = Math.min(maximumNodes, 5_000);
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
        const bundleSets = corridors.map((corridor) => generateCycleBundles(
          layout,
          seam,
          corridor,
          edges.filter((edge) => edge.cycleIndex === corridor.cycleIndex),
          Math.min(sampleCount, 33),
          "principal-only",
          140,
          hard,
          endpointRadius,
        ));
        searchedCandidates += bundleSets.reduce((sum, bundles) => sum + bundles.length, 0);
        const solution = solveGreedyBundleState(bundleSets, hard, endpointRadius)
          ?? solveBundleState(bundleSets, hard, endpointRadius, fastNodeLimit);
        if (!solution) { searchNodes += fastNodeLimit; continue; }
        searchNodes += solution.nodes;
        const clearance = analyzeRouteClearance(solution.routes, layout, hard, endpointRadius);
        if (clearance.hardCollisionCount !== 0 || clearance.minimumClearance < hard) continue;
        const deficit = Number.isFinite(clearance.minimumClearance) ? Math.max(0, preferred - clearance.minimumClearance) : 0;
        return Object.freeze({
          isRoutable: true,
          permutation: value,
          layout,
          phase: layout.innerPhase,
          outerSeam: seam.outerSeam,
          innerSeam: seam.innerSeam,
          corridors,
          routes: Object.freeze(solution.routes),
          diagnostics: Object.freeze({
            ...clearance,
            searchedPhaseCount: phaseIndex + 1,
            searchedCandidateCount: searchedCandidates,
            searchNodes,
            elapsedMilliseconds: performance.now() - started,
            phaseScore: endpointPhasePenalty(value, edges, phase) + solution.score + deficit * 0.3,
            routeScore: solution.score,
            preferredClearanceDeficit: deficit,
            topologicalRejections,
            principalThroughFallbackUsed: false,
            throughRoutes: Object.freeze([]),
          }),
        } satisfies RoutedAnnularSuccess);
      }
    }
    return Object.freeze({
      isRoutable: false,
      permutation: value,
      reason: "search-limit-exceeded",
      diagnostics: Object.freeze({ ...EMPTY_METRICS, searchedPhaseCount: Math.min(phases.length, 2), searchedCandidateCount: searchedCandidates, searchNodes, topologicalRejections, elapsedMilliseconds: performance.now() - started }),
    } satisfies RoutedAnnularFailure);
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
            const candidateLimit = allowNonPrincipalThrough ? maximumCandidatesPerEdge * 10 : maximumCandidatesPerEdge;
            return generateCycleBundles(layout, seam, corridor, edges.filter((edge) => edge.cycleIndex === corridor.cycleIndex), sampleCount, policy, candidateLimit, hard, endpointRadius);
          });
          searchedCandidates += bundleSets.reduce((sum, bundles) => sum + bundles.length, 0);
          const solution = solveBundleState(bundleSets, hard, endpointRadius, maximumNodes);
          if (!solution) { searchNodes += maximumNodes; continue; }
          searchNodes += solution.nodes;
          const clearance = analyzeRouteClearance(solution.routes, layout, hard, endpointRadius);
          if (clearance.hardCollisionCount !== 0 || clearance.minimumClearance < hard) continue;
          const deficit = Number.isFinite(clearance.minimumClearance) ? Math.max(0, preferred - clearance.minimumClearance) : 0;
          const phaseScore = endpointPhasePenalty(value, edges, phase) + solution.score + deficit * 0.3 - Math.min(clearance.minimumClearance, preferred) * 0.03;
          const throughRoutes: readonly ThroughRouteDiagnostic[] = Object.freeze(solution.routes.flatMap((route) => {
          if (route.principalWinding === undefined || route.principalAngularDisplacement === undefined) return [];
          const selectedAngularDisplacement = route.route.angularDisplacement;
          return [Object.freeze({
            edgeId: route.edge.id,
            principalWinding: route.principalWinding,
            selectedWinding: route.winding,
            principalAngularDisplacement: route.principalAngularDisplacement,
            selectedAngularDisplacement,
            routeLength: route.routeLength ?? 0,
            principalClassProvenInfeasible: allowNonPrincipalThrough,
            excessiveAngularTravel: Math.abs(selectedAngularDisplacement) > Math.abs(route.principalAngularDisplacement) + Math.PI / 2,
          })];
          }));
          const angularWarnings = throughRoutes
            .filter((route) => route.excessiveAngularTravel && !route.principalClassProvenInfeasible)
            .map((route) => `${route.edgeId} uses excessive non-principal angular travel`);
          return Object.freeze({ isRoutable: true, permutation: value, layout, phase: layout.innerPhase, outerSeam: seam.outerSeam, innerSeam: seam.innerSeam, corridors, routes: Object.freeze(solution.routes), diagnostics: Object.freeze({ ...clearance, labelWarnings: Object.freeze([...clearance.labelWarnings, ...angularWarnings]), searchedPhaseCount: phaseIndex + 1, searchedCandidateCount: searchedCandidates, searchNodes, elapsedMilliseconds: performance.now() - started, phaseScore, routeScore: solution.score, preferredClearanceDeficit: deficit, topologicalRejections, principalThroughFallbackUsed: allowNonPrincipalThrough, throughRoutes }) } satisfies RoutedAnnularSuccess);
        }
      }
    }
  }
  return Object.freeze({ isRoutable: false, permutation: value, reason: "no-collision-free-routing", diagnostics: Object.freeze({ ...EMPTY_METRICS, searchedPhaseCount: phases.length, searchedCandidateCount: searchedCandidates, searchNodes, topologicalRejections, elapsedMilliseconds: performance.now() - started }) } satisfies RoutedAnnularFailure);
}

export function serializeRoutedAnnularDiagram(diagram: RoutedAnnularDiagram): string {
  const data = diagram.isRoutable ? { p: diagram.permutation.p, q: diagram.permutation.q, phase: Number(diagram.phase.toFixed(12)), outerSeam: diagram.outerSeam, innerSeam: diagram.innerSeam, cycles: diagram.corridors.map((corridor) => ({ cycle: `(${corridor.cycle.join(" ")})`, corridor: corridor.kind, nestingDepth: corridor.nestingDepth })), routes: diagram.routes.map((route) => ({ edge: `${route.edge.startLabel}->${route.edge.endLabel}`, winding: route.winding, principalWinding: route.principalWinding, angularDisplacement: route.route.angularDisplacement, principalAngularDisplacement: route.principalAngularDisplacement, routeLength: route.routeLength, lane: route.lane, excursion: route.excursion, angularBias: route.angularBias, routeFamily: route.routeFamily })), principalThroughFallbackUsed: diagram.diagnostics.principalThroughFallbackUsed } : { p: diagram.permutation.p, q: diagram.permutation.q, failure: diagram.reason };
  return JSON.stringify(data, null, 2);
}
