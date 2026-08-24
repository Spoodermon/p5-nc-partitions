import type { AnnularPermutation } from "../../math/annular";
import type { AnnularBoundary, AnnularLayout, AnnularRoute, AnnularRouteKind, Point } from "../annular";

export type AnnularEdgeRole = "forward" | "return" | "singleton";

export interface AnnularDirectedEdge {
  readonly id: string;
  readonly cycleIndex: number;
  readonly edgeIndex: number;
  readonly cycleLength: number;
  readonly startLabel: number;
  readonly endLabel: number;
  readonly startBoundary: AnnularBoundary;
  readonly endBoundary: AnnularBoundary;
  readonly kind: AnnularRouteKind;
  readonly role: AnnularEdgeRole;
  readonly closesCycle: boolean;
}

export interface AnnularRouteCandidate {
  readonly edge: AnnularDirectedEdge;
  readonly winding: number;
  readonly lane: number;
  readonly excursion: number;
  readonly angularBias: number;
  readonly route: AnnularRoute;
  readonly samples: readonly Point[];
  readonly localScore: number;
  readonly key: string;
}

export interface RoutedAnnularEdge extends AnnularRouteCandidate {}

export interface RoutePairDiagnostic {
  readonly firstEdgeId: string;
  readonly secondEdgeId: string;
  readonly clearance: number;
  readonly intersects: boolean;
  readonly coincident: boolean;
}

export interface RoutingMetrics {
  readonly hardCollisionCount: number;
  readonly minimumClearance: number;
  readonly worstPair: RoutePairDiagnostic | null;
  readonly labelWarnings: readonly string[];
  readonly searchedPhaseCount: number;
  readonly searchedCandidateCount: number;
  readonly searchNodes: number;
  readonly elapsedMilliseconds: number;
  readonly phaseScore: number;
  readonly routeScore: number;
}

export interface RoutingOptions {
  readonly phaseCandidateCount?: number;
  readonly maxCandidatesPerEdge?: number;
  readonly maxSearchNodes?: number;
  readonly sampleCount?: number;
  readonly hardClearance?: number;
  readonly commonEndpointRadius?: number;
}

export type RoutingFailureReason =
  | "not-annular-noncrossing"
  | "search-limit-exceeded"
  | "no-collision-free-routing";

export interface RoutedAnnularSuccess {
  readonly isRoutable: true;
  readonly permutation: AnnularPermutation;
  readonly layout: AnnularLayout;
  readonly phase: number;
  readonly routes: readonly RoutedAnnularEdge[];
  readonly diagnostics: RoutingMetrics;
}

export interface RoutedAnnularFailure {
  readonly isRoutable: false;
  readonly permutation: AnnularPermutation;
  readonly reason: RoutingFailureReason;
  readonly diagnostics: RoutingMetrics;
}

export type RoutedAnnularDiagram = RoutedAnnularSuccess | RoutedAnnularFailure;

