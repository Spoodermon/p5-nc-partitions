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
  readonly routeFamily?: "analytical-bump" | "cover-cubic";
  readonly strokeWidth?: number;
  readonly principalWinding?: number;
  readonly principalAngularDisplacement?: number;
  readonly routeLength?: number;
  readonly isPrincipalThroughRoute?: boolean;
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
  readonly materializedRouteCandidateCount?: number;
  readonly attemptedBundleCount?: number;
  readonly rejectedBundleCount?: number;
  readonly materializedSamplePointCount?: number;
  readonly searchNodes: number;
  readonly bundleValidationChecks?: number;
  readonly elapsedMilliseconds: number;
  readonly phaseScore: number;
  readonly routeScore: number;
  readonly preferredClearanceDeficit?: number;
  readonly topologicalRejections?: number;
  readonly principalThroughFallbackUsed?: boolean;
  readonly throughRoutes?: readonly ThroughRouteDiagnostic[];
  readonly requestedHardClearance?: number;
  readonly maxSearchNodes?: number;
  readonly maxMaterializedRouteCandidates?: number;
  readonly maxMaterializedSamplePoints?: number;
  readonly maxBundleValidationChecks?: number;
  readonly principalSearchProof?: "feasible" | "proven-infeasible" | "not-proven";
  readonly verificationTolerance?: number;
  readonly verificationClearanceMargin?: number;
  readonly verificationMaximumDepth?: number;
  readonly verificationMaximumSegmentsPerRoute?: number;
}

export interface ThroughRouteDiagnostic {
  readonly edgeId: string;
  readonly principalWinding: number;
  readonly selectedWinding: number;
  readonly principalAngularDisplacement: number;
  readonly selectedAngularDisplacement: number;
  readonly routeLength: number;
  readonly principalClassProvenInfeasible: boolean;
  readonly excessiveAngularTravel: boolean;
}

export interface RoutingOptions {
  readonly phaseCandidateCount?: number;
  readonly maxCandidatesPerEdge?: number;
  readonly maxSearchNodes?: number;
  readonly sampleCount?: number;
  readonly hardClearance?: number;
  readonly commonEndpointRadius?: number;
  readonly strokeWidth?: number;
  readonly visualGap?: number;
  readonly preferredClearance?: number;
}

export type CycleCorridorKind = "outer-collar" | "inner-collar" | "through";

export interface BoundaryLinearPosition {
  readonly label: number;
  readonly rank: number;
  readonly liftAngle: number;
}

export interface CycleCorridor {
  readonly cycleIndex: number;
  readonly cycle: readonly number[];
  readonly kind: CycleCorridorKind;
  readonly nestingDepth: number;
  readonly span: readonly [number, number] | null;
  readonly lowerCoverHeight: number;
  readonly upperCoverHeight: number;
}

export interface SeamState {
  readonly outerSeam: number;
  readonly innerSeam: number;
  readonly outerPositions: readonly BoundaryLinearPosition[];
  readonly innerPositions: readonly BoundaryLinearPosition[];
}

export interface CycleRouteBundle {
  readonly cycleIndex: number;
  readonly corridor: CycleCorridor;
  readonly vertexLifts: Readonly<Record<number, number>>;
  readonly routes: readonly AnnularRouteCandidate[];
  readonly score: number;
  readonly key: string;
  readonly internallyValidated?: boolean;
  readonly nonPrincipalThroughCount?: number;
  readonly throughAngularTravel?: number;
  readonly geometricLength?: number;
}

export type RoutingFailureReason =
  | "invalid-mathematical-input"
  | "invalid-routing-options"
  | "search-limit-exceeded"
  | "no-route-within-routing-policy"
  | "geometry-verification-failed";

export interface RoutedAnnularSuccess {
  readonly isRoutable: true;
  readonly permutation: AnnularPermutation;
  readonly layout: AnnularLayout;
  readonly phase: number;
  readonly outerSeam: number;
  readonly innerSeam: number;
  readonly corridors: readonly CycleCorridor[];
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
