import { isAnnularNoncrossing, type AnnularPermutation } from "../../math/annular";
import { annularVertex, createAnnularLayout } from "../annular";
import { generateRouteCandidates } from "./candidates";
import { analyzeRouteClearance } from "./clearance";
import { extractAnnularEdges } from "./edges";
import { routesConflict } from "./intersections";
import { annularPhaseCandidates, endpointPhasePenalty } from "./phase";
import type {
  AnnularDirectedEdge,
  AnnularRouteCandidate,
  RoutedAnnularDiagram,
  RoutedAnnularFailure,
  RoutedAnnularSuccess,
  RoutingMetrics,
  RoutingOptions,
} from "./types";

export const DEFAULT_HARD_CLEARANCE = 0.1;
export const DEFAULT_COMMON_ENDPOINT_RADIUS = 48;

const EMPTY_METRICS: RoutingMetrics = Object.freeze({
  hardCollisionCount: 0,
  minimumClearance: Number.POSITIVE_INFINITY,
  worstPair: null,
  labelWarnings: Object.freeze([]),
  searchedPhaseCount: 0,
  searchedCandidateCount: 0,
  searchNodes: 0,
  elapsedMilliseconds: 0,
  phaseScore: Number.POSITIVE_INFINITY,
  routeScore: Number.POSITIVE_INFINITY,
});

function difficulty(edge: AnnularDirectedEdge): number {
  // Restrained singleton loops have few choices and act as local obstacles, so
  // placing them first prevents a late loop from invalidating a large subtree.
  if (edge.role === "singleton") return 700;
  if (edge.role === "return" && edge.kind !== "through") return 600 + edge.cycleLength;
  if (edge.kind !== "through") return 500 + edge.cycleLength;
  if (edge.kind === "through") return 400 + edge.cycleLength;
  return 200 + edge.cycleLength;
}

function routeSetScore(routes: readonly AnnularRouteCandidate[]): number {
  let score = routes.reduce((sum, candidate) => sum + candidate.localScore, 0);
  const cycles = new Map<number, AnnularRouteCandidate[]>();
  routes.forEach((route) => cycles.set(route.edge.cycleIndex, [...(cycles.get(route.edge.cycleIndex) ?? []), route]));
  cycles.forEach((cycleRoutes) => {
    const windings = cycleRoutes.filter((route) => route.edge.role !== "singleton").map((route) => route.winding);
    for (let index = 1; index < windings.length; index += 1) score += Math.abs((windings[index] as number) - (windings[index - 1] as number)) * 3;
    const returned = cycleRoutes.find((route) => route.edge.role === "return");
    const forwards = cycleRoutes.filter((route) => route.edge.role === "forward" && route.edge.kind !== "through");
    if (returned && forwards.length > 0) {
      const deepestForward = Math.max(...forwards.map((route) => route.lane));
      if (returned.lane < deepestForward) score += (deepestForward - returned.lane) * 5;
    }
  });
  return score;
}

interface PhaseSolution {
  readonly routes: readonly AnnularRouteCandidate[];
  readonly score: number;
  readonly nodes: number;
  readonly candidates: number;
  readonly limitHit: boolean;
}

function solvePhase(
  edges: readonly AnnularDirectedEdge[],
  candidateSets: ReadonlyMap<string, readonly AnnularRouteCandidate[]>,
  hardClearance: number,
  endpointRadius: number,
  maxNodes: number,
): PhaseSolution | null {
  const ordered = [...edges].sort((a, b) => difficulty(b) - difficulty(a) || a.id.localeCompare(b.id));
  const assigned: AnnularRouteCandidate[] = [];
  let best: readonly AnnularRouteCandidate[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let nodes = 0;
  let limitHit = false;

  const visit = (index: number, partialScore: number): void => {
    if (best !== null) return;
    if (nodes >= maxNodes) { limitHit = true; return; }
    nodes += 1;
    if (partialScore >= bestScore) return;
    if (index === ordered.length) {
      const completeScore = routeSetScore(assigned);
      if (completeScore < bestScore) {
        bestScore = completeScore;
        best = [...assigned].sort((a, b) => a.edge.cycleIndex - b.edge.cycleIndex || a.edge.edgeIndex - b.edge.edgeIndex);
      }
      return;
    }
    const edge = ordered[index] as AnnularDirectedEdge;
    for (const candidate of candidateSets.get(edge.id) ?? []) {
      if (assigned.some((existing) => routesConflict(existing, candidate, hardClearance, endpointRadius))) continue;
      assigned.push(candidate);
      visit(index + 1, partialScore + candidate.localScore);
      assigned.pop();
      if (best !== null) break;
      if (nodes >= maxNodes) break;
    }
  };
  visit(0, 0);
  if (best === null) return null;
  return { routes: best, score: bestScore, nodes, candidates: [...candidateSets.values()].reduce((sum, set) => sum + set.length, 0), limitHit };
}

export function routeAnnularPermutation(value: AnnularPermutation, options: RoutingOptions = {}): RoutedAnnularDiagram {
  const started = performance.now();
  if (!isAnnularNoncrossing(value)) {
    return Object.freeze({
      isRoutable: false,
      permutation: value,
      reason: "not-annular-noncrossing",
      diagnostics: Object.freeze({ ...EMPTY_METRICS, elapsedMilliseconds: performance.now() - started }),
    } satisfies RoutedAnnularFailure);
  }
  const phaseCount = options.phaseCandidateCount ?? 9;
  const maximumCandidates = options.maxCandidatesPerEdge ?? 220;
  const maximumNodes = options.maxSearchNodes ?? 10_000;
  const sampleCount = options.sampleCount ?? 49;
  const hardClearance = options.hardClearance ?? DEFAULT_HARD_CLEARANCE;
  const endpointRadius = options.commonEndpointRadius ?? DEFAULT_COMMON_ENDPOINT_RADIUS;
  const edges = extractAnnularEdges(value);
  const phases = annularPhaseCandidates(value.p, value.q, phaseCount);
  let best: { phase: number; layout: ReturnType<typeof createAnnularLayout>; solution: PhaseSolution; phaseScore: number } | null = null;
  let totalNodes = 0;
  let totalCandidates = 0;
  let anyLimitHit = false;

  for (const phase of phases) {
    const layout = createAnnularLayout(value.p, value.q, { innerPhase: phase });
    const candidateSets = new Map(edges.map((edge) => [edge.id, generateRouteCandidates(layout, edge, sampleCount, maximumCandidates)]));
    const solution = solvePhase(edges, candidateSets, hardClearance, endpointRadius, maximumNodes);
    totalCandidates += [...candidateSets.values()].reduce((sum, set) => sum + set.length, 0);
    if (!solution) { totalNodes += maximumNodes; anyLimitHit = true; continue; }
    totalNodes += solution.nodes;
    anyLimitHit ||= solution.limitHit;
    const geometry = analyzeRouteClearance(solution.routes, layout, hardClearance, endpointRadius);
    const clearanceReward = Number.isFinite(geometry.minimumClearance) ? -Math.min(geometry.minimumClearance, 40) * 0.08 : 0;
    const phaseScore = endpointPhasePenalty(value, edges, phase) + solution.score + clearanceReward;
    if (best === null || phaseScore < best.phaseScore - 1e-9 || (Math.abs(phaseScore - best.phaseScore) < 1e-9 && phase < best.phase)) {
      best = { phase, layout, solution, phaseScore };
    }
  }

  if (best === null) {
    return Object.freeze({
      isRoutable: false,
      permutation: value,
      reason: anyLimitHit ? "search-limit-exceeded" : "no-collision-free-routing",
      diagnostics: Object.freeze({
        ...EMPTY_METRICS,
        searchedPhaseCount: phases.length,
        searchedCandidateCount: totalCandidates,
        searchNodes: totalNodes,
        elapsedMilliseconds: performance.now() - started,
      }),
    } satisfies RoutedAnnularFailure);
  }
  const clearance = analyzeRouteClearance(best.solution.routes, best.layout, hardClearance, endpointRadius);
  const diagnostics: RoutingMetrics = Object.freeze({
    ...clearance,
    searchedPhaseCount: phases.length,
    searchedCandidateCount: totalCandidates,
    searchNodes: totalNodes,
    elapsedMilliseconds: performance.now() - started,
    phaseScore: best.phaseScore,
    routeScore: best.solution.score,
  });
  return Object.freeze({
    isRoutable: true,
    permutation: value,
    layout: best.layout,
    phase: best.phase,
    routes: Object.freeze(best.solution.routes),
    diagnostics,
  } satisfies RoutedAnnularSuccess);
}

export function serializeRoutedAnnularDiagram(diagram: RoutedAnnularDiagram): string {
  const data = diagram.isRoutable ? {
    p: diagram.permutation.p,
    q: diagram.permutation.q,
    phase: Number(diagram.phase.toFixed(12)),
    routes: diagram.routes.map((route) => ({
      edge: `${route.edge.startLabel}->${route.edge.endLabel}`,
      winding: route.winding,
      lane: route.lane,
      excursion: route.excursion,
      angularBias: route.angularBias,
    })),
  } : { p: diagram.permutation.p, q: diagram.permutation.q, failure: diagram.reason };
  return JSON.stringify(data, null, 2);
}
