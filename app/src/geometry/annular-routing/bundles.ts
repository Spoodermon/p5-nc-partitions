import { ROUTING_POLICY } from "../../config/routingPolicy";
import {
  createAnnularRoute,
  createCoverCubicAnnularRoute,
  sampleAnnularRoute,
  type AnnularLayout,
  type AnnularRoute,
} from "../annular";
import { boundaryPosition } from "./seams";
import { routesConflict } from "./intersections";
import type {
  AnnularDirectedEdge,
  AnnularRouteCandidate,
  CycleCorridor,
  CycleRouteBundle,
  SeamState,
} from "./types";

const TWO_PI = 2 * Math.PI;
const DEFAULT_STROKE_WIDTH = 4;

export interface CandidateGenerationBudget {
  readonly routeLimit: number;
  readonly pointLimit: number;
  readonly validationLimit: number;
  materializedRoutes: number;
  materializedPoints: number;
  attemptedBundles: number;
  rejectedBundles: number;
  validationChecks: number;
  exhausted: boolean;
  validationExhausted: boolean;
  exhaustedResource?: "route-candidates" | "sample-points" | "route-candidates-and-sample-points" | "invalid-generation-budget";
}

export function createCandidateGenerationBudget(
  routeLimit: number = ROUTING_POLICY.maxMaterializedRouteCandidates,
  pointLimit: number = ROUTING_POLICY.maxMaterializedSamplePoints,
  validationLimit: number = ROUTING_POLICY.maxBundleValidationChecks,
): CandidateGenerationBudget {
  const boundedLimit = (value: number, maximum: number): number => Number.isFinite(value)
    ? Math.min(maximum, Math.max(0, Math.floor(value)))
    : 0;
  const boundedRouteLimit = boundedLimit(routeLimit, ROUTING_POLICY.maxCallMaterializedRouteCandidates);
  const boundedPointLimit = boundedLimit(pointLimit, ROUTING_POLICY.maxCallMaterializedSamplePoints);
  const boundedValidationLimit = boundedLimit(validationLimit, ROUTING_POLICY.maxBundleValidationChecks);
  return {
    routeLimit: boundedRouteLimit,
    pointLimit: boundedPointLimit,
    validationLimit: boundedValidationLimit,
    materializedRoutes: 0,
    materializedPoints: 0,
    attemptedBundles: 0,
    rejectedBundles: 0,
    validationChecks: 0,
    exhausted: boundedRouteLimit === 0 || boundedPointLimit === 0,
    validationExhausted: boundedValidationLimit === 0,
  };
}

function budgetHasValidShape(budget: CandidateGenerationBudget): boolean {
  const values = [
    budget.routeLimit,
    budget.pointLimit,
    budget.validationLimit,
    budget.materializedRoutes,
    budget.materializedPoints,
    budget.attemptedBundles,
    budget.rejectedBundles,
    budget.validationChecks,
  ];
  return values.every((value) => Number.isSafeInteger(value) && value >= 0)
    && budget.routeLimit <= ROUTING_POLICY.maxCallMaterializedRouteCandidates
    && budget.pointLimit <= ROUTING_POLICY.maxCallMaterializedSamplePoints
    && budget.validationLimit <= ROUTING_POLICY.maxBundleValidationChecks
    && budget.materializedRoutes <= budget.routeLimit
    && budget.materializedPoints <= budget.pointLimit
    && budget.attemptedBundles <= budget.materializedRoutes
    && budget.validationChecks <= budget.validationLimit
    && budget.rejectedBundles <= budget.attemptedBundles
    && typeof budget.exhausted === "boolean"
    && typeof budget.validationExhausted === "boolean"
    && (budget.exhaustedResource === undefined || [
      "route-candidates",
      "sample-points",
      "route-candidates-and-sample-points",
      "invalid-generation-budget",
    ].includes(budget.exhaustedResource));
}

function reserveCandidateBundle(budget: CandidateGenerationBudget, routeCount: number, sampleCount: number): boolean {
  if (budget.exhausted || budget.validationExhausted) return false;
  if (!budgetHasValidShape(budget)
    || !Number.isSafeInteger(routeCount) || routeCount < 1
    || !Number.isSafeInteger(sampleCount) || sampleCount < 2) {
    budget.exhausted = true;
    budget.validationExhausted = true;
    budget.exhaustedResource = "invalid-generation-budget";
    return false;
  }
  const pointCount = routeCount * sampleCount;
  const routesOverflow = budget.materializedRoutes + routeCount > budget.routeLimit;
  const pointsOverflow = !Number.isSafeInteger(pointCount)
    || budget.materializedPoints + pointCount > budget.pointLimit;
  if (routesOverflow || pointsOverflow) {
    budget.exhausted = true;
    budget.exhaustedResource = routesOverflow && pointsOverflow
      ? "route-candidates-and-sample-points"
      : routesOverflow ? "route-candidates" : "sample-points";
    return false;
  }
  budget.attemptedBundles += 1;
  budget.materializedRoutes += routeCount;
  budget.materializedPoints += pointCount;
  return true;
}

export function consumeCandidateValidationCheck(budget: CandidateGenerationBudget): boolean {
  if (budget.validationExhausted) return false;
  if (!budgetHasValidShape(budget)) {
    budget.exhausted = true;
    budget.validationExhausted = true;
    budget.exhaustedResource = "invalid-generation-budget";
    return false;
  }
  if (budget.validationChecks >= budget.validationLimit) {
    budget.validationExhausted = true;
    return false;
  }
  budget.validationChecks += 1;
  return true;
}

function routesAreInternallyValid(
  routes: readonly AnnularRouteCandidate[],
  hardClearance: number,
  endpointRadius: number,
  budget: CandidateGenerationBudget,
): boolean {
  for (let first = 0; first < routes.length; first += 1) for (let second = first + 1; second < routes.length; second += 1) {
    if (!consumeCandidateValidationCheck(budget)) return false;
    if (routesConflict(routes[first] as AnnularRouteCandidate, routes[second] as AnnularRouteCandidate, hardClearance, endpointRadius)) return false;
  }
  return true;
}

function boundedCandidates<T>(ordered: readonly T[], limit: number, reserve?: (value: T) => boolean, coverFullRange = reserve === undefined): readonly T[] {
  if (ordered.length <= limit) return ordered;
  const coverageOrder = (length: number): number[] => {
    if (length <= 0) return [];
    const result: number[] = [length - 1];
    const intervals: Array<readonly [number, number]> = [[0, length - 1]];
    for (let intervalIndex = 0; intervalIndex < intervals.length; intervalIndex += 1) {
      const [from, to] = intervals[intervalIndex] as readonly [number, number];
      if (to - from <= 1) continue;
      const middle = Math.floor((from + to) / 2);
      result.push(middle);
      intervals.push([from, middle], [middle, to]);
    }
    return result;
  };
  const reserved = reserve
    ? ordered.flatMap((value, index) => reserve(value) ? [index] : [])
    : [];
  const reservedOrder = coverageOrder(reserved.length).map((index) => reserved[index] as number);
  const coverage = coverFullRange ? coverageOrder(ordered.length) : [];
  const ranked: number[] = [];
  const selected = new Set<number>();
  let preferredIndex = 0;
  let reservedIndex = 0;
  let coverageIndex = 0;
  const add = (index: number | undefined): void => {
    if (index === undefined || index < 0 || index >= ordered.length || selected.has(index)) return;
    selected.add(index);
    ranked.push(index);
  };
  // A fixed 3:1[:1] interleave gives score, feasibility, and range coverage
  // deterministic ranks. Since the rank order is independent of `limit`, a
  // larger candidate cap is a true superset of every smaller frontier.
  while (ranked.length < limit) {
    const before = ranked.length;
    for (let count = 0; count < (reserve && coverFullRange ? 2 : 3); count += 1) add(preferredIndex++);
    if (reserve) add(reservedOrder[reservedIndex++]);
    if (coverFullRange) add(coverage[coverageIndex++]);
    if (ranked.length === before) {
      while (preferredIndex < ordered.length) add(preferredIndex++);
    }
  }
  return ranked.slice(0, limit).sort((a, b) => a - b).map((index) => ordered[index] as T);
}

export function principalThroughWinding(startAngle: number, endAngle: number): number {
  const ratio = (startAngle - endAngle) / TWO_PI;
  const lower = Math.floor(ratio);
  const upper = Math.ceil(ratio);
  const lowerTravel = Math.abs(endAngle + lower * TWO_PI - startAngle);
  const upperTravel = Math.abs(endAngle + upper * TWO_PI - startAngle);
  const selected = Math.abs(lowerTravel - upperTravel) > 1e-12
    ? (lowerTravel < upperTravel ? lower : upper)
    : Math.abs(lower) !== Math.abs(upper)
      ? (Math.abs(lower) < Math.abs(upper) ? lower : upper)
      : Math.min(lower, upper);
  return selected === 0 ? 0 : selected;
}

function candidate(
  layout: AnnularLayout,
  edge: AnnularDirectedEdge,
  route: AnnularRoute,
  lane: number,
  localScore: number,
  key: string,
  sampleCount: number,
  family: "analytical-bump" | "cover-cubic",
): AnnularRouteCandidate {
  const samples = sampleAnnularRoute(route, sampleCount);
  const routeLength = samples.slice(1).reduce((sum, point, index) => {
    const previous = samples[index] as { readonly x: number; readonly y: number };
    return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
  const startAngle = layout.vertices[edge.startLabel - 1]?.angle;
  const endAngle = layout.vertices[edge.endLabel - 1]?.angle;
  const isThrough = edge.startBoundary !== edge.endBoundary;
  const principalWinding = isThrough && startAngle !== undefined && endAngle !== undefined
    ? principalThroughWinding(startAngle, endAngle)
    : undefined;
  const principalAngularDisplacement = principalWinding === undefined || startAngle === undefined || endAngle === undefined
    ? undefined
    : endAngle + principalWinding * TWO_PI - startAngle;
  return Object.freeze({
    edge,
    winding: route.winding,
    lane,
    excursion: route.excursion,
    angularBias: route.angularBias,
    route,
    samples,
    localScore,
    key,
    routeFamily: family,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    principalWinding,
    principalAngularDisplacement,
    routeLength,
    isPrincipalThroughRoute: principalWinding === undefined ? undefined : route.winding === principalWinding,
  });
}

function normalizedLiftAngles(
  layout: AnnularLayout,
  edge: AnnularDirectedEdge,
  lifts: Readonly<Record<number, number>>,
): readonly [number, number] {
  const startLift = lifts[edge.startLabel];
  const endLift = lifts[edge.endLabel];
  if (startLift === undefined || endLift === undefined) throw new Error("cycle lift invariant violated");
  const startAngle = layout.vertices[edge.startLabel - 1]?.angle;
  if (startAngle === undefined) throw new Error("layout vertex invariant violated");
  const deckShift = startLift - startAngle;
  return Object.freeze([startAngle, endLift - deckShift]);
}

function followsContiguousBoundaryChain(layout: AnnularLayout, corridor: CycleCorridor): boolean {
  const boundaryStart = corridor.kind === "outer-collar" ? 1 : layout.p + 1;
  const boundarySize = corridor.kind === "outer-collar" ? layout.p : layout.q;
  return corridor.cycle.slice(0, -1).every((label, index) => {
    const next = corridor.cycle[index + 1];
    const expected = boundaryStart + ((label - boundaryStart + 1) % boundarySize);
    return next === expected;
  });
}

function liftsUsePrincipalThroughEdges(
  layout: AnnularLayout,
  edges: readonly AnnularDirectedEdge[],
  lifts: Readonly<Record<number, number>>,
): boolean {
  return edges.every((edge) => {
    if (edge.startBoundary === edge.endBoundary) return true;
    const [start, end] = normalizedLiftAngles(layout, edge, lifts);
    const startAngle = layout.vertices[edge.startLabel - 1]?.angle;
    const endAngle = layout.vertices[edge.endLabel - 1]?.angle;
    if (startAngle === undefined || endAngle === undefined) throw new Error("layout vertex invariant violated");
    const selectedWinding = Math.round((end - endAngle) / TWO_PI);
    return selectedWinding === principalThroughWinding(start, endAngle);
  });
}

function pureRoute(
  layout: AnnularLayout,
  edge: AnnularDirectedEdge,
  lifts: Readonly<Record<number, number>>,
  corridor: CycleCorridor,
  laneVariant: number,
  bias: number,
  edgeDeckOffset: number,
): AnnularRoute {
  const [start, rawEnd] = normalizedLiftAngles(layout, edge, lifts);
  const noncontiguousBoundaryReturn = edge.cycleLength > 2
    && edge.role === "return"
    && !followsContiguousBoundaryChain(layout, corridor);
  // The -1 deck slot doubles as a deliberately lower-ranked compatibility
  // route for small, crowded annuli where the canonical long return cannot
  // meet hard clearance. Normal candidates retain the canonical orientation.
  const useCompatibilityReturn = noncontiguousBoundaryReturn && edgeDeckOffset === -1;
  let end = rawEnd + (useCompatibilityReturn ? 0 : edgeDeckOffset * TWO_PI);
  const effectiveDeckOffset = useCompatibilityReturn ? 0 : edgeDeckOffset;
  if (edge.cycleLength === 2) {
    // A boundary transposition is a narrow oriented ribbon: both directions
    // use one shared angular track in reverse, with radial depth separating
    // them. Prefer the shortest track; paired deck shifts remain available as
    // collision-avoidance fallbacks without breaking the ribbon topology.
    const forwardStartLabel = edge.edgeIndex === 0 ? edge.startLabel : edge.endLabel;
    const forwardEndLabel = edge.edgeIndex === 0 ? edge.endLabel : edge.startLabel;
    const forwardStart = layout.vertices[forwardStartLabel - 1]?.angle;
    const forwardEnd = layout.vertices[forwardEndLabel - 1]?.angle;
    if (forwardStart === undefined || forwardEnd === undefined) throw new Error("two-cycle layout invariant violated");
    const rawDisplacement = forwardEnd - forwardStart;
    let sharedDisplacement = ((rawDisplacement + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
    if (Math.abs(sharedDisplacement + Math.PI) < 1e-12 && rawDisplacement > 0) sharedDisplacement = Math.PI;
    sharedDisplacement += edgeDeckOffset * TWO_PI;
    end = start + (edge.edgeIndex === 0 ? sharedDisplacement : -sharedDisplacement);
  } else if (corridor.kind === "outer-collar" && edge.cycleLength > 2 && Math.abs(Math.abs(end - start) - Math.PI) < 1e-10) {
    // At an antipodal tie, use the half-boundary containing more vertices of
    // this cycle. This keeps omitted labels outside the collar region; e.g.
    // (1 3 4) on an outer four-boundary sends 1->3 past 4, not past singleton 2.
    const boundaryStart = edge.startBoundary === "outer" ? 1 : layout.p + 1;
    const boundarySize = edge.startBoundary === "outer" ? layout.p : layout.q;
    const labelsBetween = (direction: 1 | -1): readonly number[] => {
      const result: number[] = [];
      let index = edge.startLabel - boundaryStart;
      const target = edge.endLabel - boundaryStart;
      while (true) {
        index = (index + direction + boundarySize) % boundarySize;
        if (index === target) return result;
        result.push(boundaryStart + index);
      }
    };
    const positiveMembers = labelsBetween(1).filter((label) => corridor.cycle.includes(label)).length;
    const negativeMembers = labelsBetween(-1).filter((label) => corridor.cycle.includes(label)).length;
    if (positiveMembers !== negativeMembers) end = start + (positiveMembers > negativeMembers ? Math.PI : -Math.PI);
  } else if (edge.cycleLength > 2 && (
    followsContiguousBoundaryChain(layout, corridor)
    || (noncontiguousBoundaryReturn && !useCompatibilityReturn)
  )) {
    // A pure boundary cycle is a ribbon around an open angular chain.  Its
    // first n-1 edges advance in the boundary's native direction; the closing
    // edge retraces that whole chain in reverse on a deeper radial lane.  It
    // must not close across the complementary interval, where an omitted
    // singleton or another collar may live. This orientation rule also
    // applies to a non-contiguous inner return: the gaps change the length of
    // the chain, but not the clockwise direction of its closing edge. Other
    // non-contiguous edges retain their established seam/deck routing.
    const direction = edge.startBoundary === "outer" ? 1 : -1;
    const directedDisplacement = (startLabel: number, endLabel: number): number => {
      const startAngle = layout.vertices[startLabel - 1]?.angle;
      const endAngle = layout.vertices[endLabel - 1]?.angle;
      if (startAngle === undefined || endAngle === undefined) throw new Error("boundary-cycle layout invariant violated");
      let displacement = endAngle - startAngle;
      while (direction * displacement <= 1e-12) displacement += direction * TWO_PI;
      return displacement;
    };
    const forwardTravel = corridor.cycle.slice(0, -1).reduce((sum, label, index) =>
      sum + directedDisplacement(label, corridor.cycle[index + 1] as number), 0);
    let displacement = edge.role === "return"
      ? -forwardTravel
      : directedDisplacement(edge.startLabel, edge.endLabel);
    // A pure chain may change radial lanes to avoid a collision, but adding a
    // full deck turn changes a short closing arc into a visually and
    // topologically gratuitous wrap around the annulus.
    end = start + displacement;
  }
  const displacement = end - start;
  const twoCycleLaneStep = corridor.kind === "inner-collar" ? 0.115 : 0.08;
  const laneStep = edge.cycleLength === 2 ? twoCycleLaneStep : 0.02;
  const baseDepth = 0.04 + corridor.nestingDepth * 0.03 + laneVariant * laneStep;
  // Longer boundary intervals form the inner side of a contractible collar
  // polygon. Giving them a deeper radial lane prevents the complementary
  // short edges from cutting across them; the ordering is derived from the
  // lifted interval rather than from the arbitrary cycle return edge.
  const spanFraction = Math.min(1, Math.abs(displacement) / TWO_PI);
  const spanDepth = edge.cycleLength === 2
    ? corridor.kind === "inner-collar"
      ? (edge.edgeIndex === 0 ? 0 : 0.19)
      : (edge.edgeIndex === 0 ? 0.23 : spanFraction >= 0.45 ? 0.07 : 0.02)
    : edge.role === "return"
      ? Math.min(0.42, (spanFraction > 0.5 ? 1.84 : 0.85) * spanFraction ** 3)
      : Math.min(0.23, 1.84 * spanFraction ** 3);
  const innerReturnOutwardBonus = corridor.kind === "inner-collar" && edge.role === "return" && edge.cycleLength > 2 && spanFraction > 0.5
    ? 0.06 * spanFraction
    : 0;
  const chainReturnLane = edge.role === "return" && edge.cycleLength > 2 && followsContiguousBoundaryChain(layout, corridor)
    ? 0.1
    : 0;
  const maximumDepth = edge.cycleLength === 2 ? 0.5 : edge.role === "return" ? 0.56 : 0.27;
  const depth = Math.min(maximumDepth, baseDepth + Math.abs(effectiveDeckOffset) * 0.1 + spanDepth + innerReturnOutwardBonus + chainReturnLane);
  const u = corridor.kind === "outer-collar" ? 1 - depth : depth;
  return createCoverCubicAnnularRoute(layout, {
    startLabel: edge.startLabel,
    endLabel: edge.endLabel,
    startLiftAngle: start,
    endLiftAngle: end,
    control1: { theta: start + bias, u },
    control2: { theta: end + bias, u },
  });
}

function throughRoute(
  layout: AnnularLayout,
  edge: AnnularDirectedEdge,
  lifts: Readonly<Record<number, number>>,
  centralBias: number,
  radialVariant: number,
): AnnularRoute {
  const [start, end] = normalizedLiftAngles(layout, edge, lifts);
  const displacement = end - start;
  if (radialVariant === 2) {
    if (edge.startBoundary !== edge.endBoundary) {
      return createCoverCubicAnnularRoute(layout, {
        startLabel: edge.startLabel,
        endLabel: edge.endLabel,
        startLiftAngle: start,
        endLiftAngle: end,
        control1: { theta: start + displacement * 0.18 + centralBias * 0.25, u: 0.5 },
        control2: { theta: start + displacement * 0.82 + centralBias * 0.25, u: 0.5 },
      });
    }
    const legacyU = edge.startBoundary === "outer" ? 0.92 : 0.08;
    return createCoverCubicAnnularRoute(layout, {
      startLabel: edge.startLabel,
      endLabel: edge.endLabel,
      startLiftAngle: start,
      endLiftAngle: end,
      control1: { theta: start + displacement * 0.3 + centralBias, u: legacyU },
      control2: { theta: start + displacement * 0.7 + centralBias, u: legacyU },
    });
  }
  const endpointFan = radialVariant === 0 ? 0.35 : radialVariant === 3 ? -0.308 : 0.308;
  const sameBoundaryFan = endpointFan;
  const biasScale = 0.5;
  if (edge.startBoundary !== edge.endBoundary) {
    const startU = radialVariant === 0
      ? (edge.startBoundary === "outer" ? 0.25 : 0.75)
      : (edge.startBoundary === "outer" ? 0.001 : 0.999);
    const endU = radialVariant === 0
      ? (edge.endBoundary === "outer" ? 0.55 : 0.45)
      : (edge.endBoundary === "outer" ? 0.999 : 0.001);
    const admittedEndU = edge.role === "return" && edge.endBoundary === "outer" ? Math.min(endU, 0.72) : endU;
    const admittedEndTheta = edge.role === "return" && edge.endBoundary === "outer"
      ? end
      : start + displacement * 0.78 + centralBias * biasScale + endpointFan;
    return createCoverCubicAnnularRoute(layout, {
      startLabel: edge.startLabel,
      endLabel: edge.endLabel,
      startLiftAngle: start,
      endLiftAngle: end,
      control1: { theta: start + displacement * 0.22 + centralBias * biasScale - endpointFan, u: startU },
      control2: { theta: admittedEndTheta, u: admittedEndU },
    });
  }
  const spanFraction = Math.min(1, Math.abs(displacement) / TWO_PI);
  const collarDepth = radialVariant === 0
    ? Math.min(0.27, 0.05 + 1.8 * spanFraction ** 3)
    : radialVariant === 5 ? 0.15 : Math.min(0.48, 0.38 + 0.4 * spanFraction ** 3);
  const centralU = edge.startBoundary === "outer" ? 1 - collarDepth : collarDepth;
  const direction = Math.sign(displacement) || 1;
  return createCoverCubicAnnularRoute(layout, {
    startLabel: edge.startLabel,
    endLabel: edge.endLabel,
    startLiftAngle: start,
    endLiftAngle: end,
    control1: { theta: start + centralBias * biasScale + direction * sameBoundaryFan, u: centralU },
    control2: { theta: end + centralBias * biasScale - direction * sameBoundaryFan, u: centralU },
  });
}

function principalLiftRecord(layout: AnnularLayout, corridor: CycleCorridor): Readonly<Record<number, number>> {
  const result: Record<number, number> = {};
  const firstLabel = corridor.cycle[0];
  if (firstLabel === undefined) return Object.freeze(result);
  const firstAngle = layout.vertices[firstLabel - 1]?.angle;
  if (firstAngle === undefined) throw new Error("layout vertex invariant violated");
  result[firstLabel] = firstAngle;
  let previous = firstAngle;
  for (const label of corridor.cycle.slice(1)) {
    const angle = layout.vertices[label - 1]?.angle;
    if (angle === undefined) throw new Error("layout vertex invariant violated");
    const winding = principalThroughWinding(previous, angle);
    previous = angle + winding * TWO_PI;
    result[label] = previous;
  }
  return Object.freeze(result);
}

function liftRecord(
  layout: AnnularLayout,
  seam: SeamState,
  corridor: CycleCorridor,
  innerDeckOffset = 0,
  localDeckOffsets: Readonly<Record<number, number>> = {},
): Readonly<Record<number, number>> {
  const result: Record<number, number> = {};
  corridor.cycle.forEach((label) => {
    const position = boundaryPosition(seam, label, layout.p);
    result[label] = position.liftAngle + ((label > layout.p ? innerDeckOffset : 0) + (localDeckOffsets[label] ?? 0)) * TWO_PI;
  });
  return Object.freeze(result);
}

function* pureBundleSource(
  layout: AnnularLayout,
  seam: SeamState,
  corridor: CycleCorridor,
  edges: readonly AnnularDirectedEdge[],
  sampleCount: number,
  maxBundles: number,
  budget: CandidateGenerationBudget,
): Generator<CycleRouteBundle, void> {
  const lifts = liftRecord(layout, seam, corridor);
  if (edges.length === 1 && edges[0]?.role === "singleton") {
    const edge = edges[0];
    const boundarySize = edge.startBoundary === "outer" ? layout.p : layout.q;
    const availableAngularSpace = TWO_PI / boundarySize;
    const preferredBias = Math.min(0.24, Math.max(0.13, availableAngularSpace * 0.34));
    const middleRadius = (layout.outerRadius + layout.innerRadius) / 2;
    const middleU = Math.log(middleRadius / layout.innerRadius) / Math.log(layout.outerRadius / layout.innerRadius);
    const midpointExcursion = edge.startBoundary === "outer" ? 1 - middleU : middleU;
    const preferredExcursion = midpointExcursion * 0.84;
    const excursions = [...new Set([
      preferredExcursion,
      preferredExcursion * 0.82,
      preferredExcursion * 0.66,
      midpointExcursion, 0.14, 0.19, 0.25, 0.1, 0.08, 0.05, 0.03,
    ].map((value) => Number(value.toFixed(4))))];
    const specs = excursions.flatMap((excursion) => [0.08, -0.08, 0.1, -0.1, 0.14, -0.14, 0.19, -0.19, 0.24, -0.24].map((angularBias) => {
      const localScore = Math.abs(excursion - preferredExcursion) + Math.abs(Math.abs(angularBias) - preferredBias) * 0.2;
      return { excursion, angularBias, localScore, key: `singleton:${excursion}:${angularBias}` };
    }));
    const selected = boundedCandidates(specs.sort((a, b) => a.localScore - b.localScore || a.key.localeCompare(b.key)), maxBundles);
    for (const { excursion, angularBias, localScore, key } of selected) {
      if (!reserveCandidateBundle(budget, 1, sampleCount)) break;
      const route = createAnnularRoute(layout, {
        startLabel: edge.startLabel,
        endLabel: edge.endLabel,
        excursion,
        angularBias,
      });
      const routed = candidate(layout, edge, route, 0, localScore, key, sampleCount, "analytical-bump");
      yield Object.freeze({ cycleIndex: corridor.cycleIndex, corridor, vertexLifts: lifts, routes: Object.freeze([routed]), score: routed.localScore, key: routed.key });
    }
    return;
  }
  const isTwoCycle = edges.length === 2 && edges.every((edge) => edge.cycleLength === 2);
  const patterns: number[][] = isTwoCycle ? [[0, 0], [-1, -1], [1, 1]] : [Array(edges.length).fill(0)];
  if (!isTwoCycle) {
    for (let first = 0; first < edges.length; first += 1) {
      for (const sign of [-1, 1]) {
        const single = Array(edges.length).fill(0); single[first] = sign; patterns.push(single);
      }
      for (let second = 0; second < edges.length; second += 1) if (first !== second) {
        const paired = Array(edges.length).fill(0); paired[first] = -1; paired[second] = 1; patterns.push(paired);
      }
    }
  }
  const preservesChainRibbon = followsContiguousBoundaryChain(layout, corridor);
  const specs = patterns.flatMap((edgeDeckOffsets) => (isTwoCycle ? [0, 1, 2, 3] : [0, 1, 2]).flatMap((laneVariant) =>
    (isTwoCycle ? [0, 0.28, -0.28, 0.75, -0.75] : [0, 0.16, 0.28]).map((edgeSpacing) => {
      const score = edges.reduce((sum, edge) => {
        const pairedBias = edge.cycleLength === 2 ? edgeSpacing : (edge.edgeIndex - (edge.cycleLength - 1) / 2) * edgeSpacing;
        const preservesRibbon = edge.cycleLength === 2 || preservesChainRibbon || (corridor.kind === "inner-collar" && edge.role === "return");
        const homotopyPenalty = preservesRibbon ? Math.abs(edgeDeckOffsets[edge.edgeIndex] ?? 0) * 2 : 0;
        return sum + laneVariant + Math.abs(pairedBias) + homotopyPenalty;
      }, 0);
      return { edgeDeckOffsets, laneVariant, edgeSpacing, score, key: `pure:${edgeDeckOffsets.join(",")}:${laneVariant}:${edgeSpacing}` };
    })));
  const selected = boundedCandidates(specs.sort((a, b) => a.score - b.score || a.key.localeCompare(b.key)), maxBundles);
  for (const { edgeDeckOffsets, laneVariant, edgeSpacing, key } of selected) {
      if (!reserveCandidateBundle(budget, edges.length, sampleCount)) break;
      const routes = edges.map((edge) => {
        const pairedBias = edge.cycleLength === 2 ? edgeSpacing : (edge.edgeIndex - (edge.cycleLength - 1) / 2) * edgeSpacing;
        const route = pureRoute(layout, edge, lifts, corridor, laneVariant, pairedBias, edgeDeckOffsets[edge.edgeIndex] ?? 0);
        const preservesChainRibbon = edge.cycleLength === 2
          || followsContiguousBoundaryChain(layout, corridor)
          || (corridor.kind === "inner-collar" && edge.role === "return");
        const homotopyPenalty = preservesChainRibbon ? Math.abs(edgeDeckOffsets[edge.edgeIndex] ?? 0) * 2 : 0;
        return candidate(layout, edge, route, laneVariant + (edge.role === "return" ? 1 : 0), laneVariant + Math.abs(pairedBias) + homotopyPenalty, `pure:${laneVariant}:${pairedBias}`, sampleCount, "cover-cubic");
      });
      yield Object.freeze({ cycleIndex: corridor.cycleIndex, corridor, vertexLifts: lifts, routes: Object.freeze(routes), score: routes.reduce((sum, route) => sum + route.localScore, 0), key });
  }
}

function* throughBundleSource(
  layout: AnnularLayout,
  seam: SeamState,
  corridor: CycleCorridor,
  edges: readonly AnnularDirectedEdge[],
  sampleCount: number,
  homotopyPolicy: "all" | "principal-only" | "nonprincipal-only",
  maxBundles: number,
  hardClearance: number,
  endpointRadius: number,
  budget: CandidateGenerationBudget,
): Generator<CycleRouteBundle, void> {
  let acceptedBundleCount = 0;
  const corridorBias = corridor.cycleIndex * 0.18;
  const innerLabels = corridor.cycle.filter((label) => label > layout.p);
  const deckLabels = corridor.cycle.length >= 4
    ? [...corridor.cycle]
    : innerLabels.length > 1 ? innerLabels : corridor.cycle.filter((label) => label <= layout.p);
  const liftVariants: Array<{ key: string; uniform: number; local: Record<number, number>; lifts?: Readonly<Record<number, number>> }> = [
    { key: "principal", uniform: 0, local: {}, lifts: principalLiftRecord(layout, corridor) },
    ...[-1, 0, 1].map((uniform) => ({ key: `${uniform}`, uniform, local: {} })),
  ];
  if (deckLabels.length > 1) for (const label of deckLabels) for (const offset of [-1, 1]) liftVariants.push({ key: `0:${label}:${offset}`, uniform: 0, local: { [label]: offset } });
  if (corridor.cycle.length === 4) for (const first of deckLabels) for (const second of deckLabels) if (first !== second) {
    liftVariants.push({ key: `0:${first}:-1:${second}:1`, uniform: 0, local: { [first]: -1, [second]: 1 } });
  }
  if (corridor.cycle.length >= 5) for (let index = 0; index < corridor.cycle.length; index += 1) {
    const first = corridor.cycle[index] as number;
    const second = corridor.cycle[(index + 1) % corridor.cycle.length] as number;
    for (const sign of [-1, 1]) liftVariants.push({ key: `0:${first}:${sign}:${second}:${-sign}`, uniform: 0, local: { [first]: sign, [second]: -sign } });
  }
  for (const mode of ["nearest", "increasing", "decreasing"] as const) {
    const local: Record<number, number> = {};
    const firstLabel = corridor.cycle[0] as number;
    let previous = boundaryPosition(seam, firstLabel, layout.p).liftAngle;
    for (const label of corridor.cycle.slice(1)) {
      const base = boundaryPosition(seam, label, layout.p).liftAngle;
      const ratio = (previous - base) / TWO_PI;
      const offset = mode === "nearest" ? Math.round(ratio) : mode === "increasing" ? Math.ceil(ratio) : Math.floor(ratio);
      local[label] = offset;
      previous = base + offset * TWO_PI;
    }
    liftVariants.push({ key: `unwrap:${mode}`, uniform: 0, local });
  }
  const radialVariants = corridor.cycle.length === 2 ? [2, 0] : corridor.cycle.length === 3 ? [2, 0, 1] : [1, 5, 2, 0];
  const bundleBiases = corridor.cycle.length === 2
    ? [0]
    : corridor.cycle.length === 3
    ? [0, 0.15, -0.15, 0.3, -0.3, 0.5, -0.5, 0.75, -0.75, 1.1, -1.1, 1.5, -1.5, 1.9, -1.9]
    : [0, 0.3, -0.3, 0.75, -0.75, 1.1, -1.1, 1.5, -1.5, 1.9, -1.9, 2.4, -2.4];
  const separations = corridor.cycle.length === 2
    ? [0.1, 0.24, 0.5, 0.7, 1, 1.3]
    : corridor.cycle.length === 3 ? [0.1, 0.18, 0.28, 0.4, 0.6, 0.85, 1.1, 1.4] : [0.1, 0.28, 0.6, 1.1, 1.8, 2.2, 2.8];
  const activeLiftVariants = liftVariants.filter((liftVariant) => {
    if (homotopyPolicy === "principal-only") return liftVariant.key === "principal";
    const lifts = liftVariant.lifts ?? liftRecord(layout, seam, corridor, liftVariant.uniform, liftVariant.local);
    const isPrincipal = liftsUsePrincipalThroughEdges(layout, edges, lifts);
    return homotopyPolicy === "all" || !isPrincipal;
  });
  const parameterCombinations = radialVariants.flatMap((radialVariant) => bundleBiases.flatMap((bundleBias) => separations.map((pairSeparation) => ({ radialVariant, bundleBias, pairSeparation })))).sort((a, b) =>
      Math.abs(a.bundleBias) - Math.abs(b.bundleBias)
      || a.pairSeparation - b.pairSeparation
      || a.radialVariant - b.radialVariant);
  const preferredCombinations = parameterCombinations.slice(0, 16);
  const feasibilityCombinations = parameterCombinations.filter((combination) => Math.abs(combination.bundleBias) >= 1.9 && combination.pairSeparation === 0.1);
  const activeCombinations = [...preferredCombinations, ...feasibilityCombinations, ...parameterCombinations]
    .filter((combination, index, all) => all.findIndex((candidate) => candidate.radialVariant === combination.radialVariant && candidate.bundleBias === combination.bundleBias && candidate.pairSeparation === combination.pairSeparation) === index);
  const specifications = activeCombinations.flatMap(({ radialVariant, bundleBias, pairSeparation }) =>
    activeLiftVariants.map((liftVariant) => ({ radialVariant, bundleBias, pairSeparation, liftVariant })));
  // A centred radial-2 route with a single coherent deck adjustment is the
  // short, high-clearance representative for crowded long through cycles.
  // Keep both deck directions in the smallest frontier so the call-wide
  // materialization budget is not spent on thousands of rejected low-radial
  // variants before this basic family is reached.
  const centralDeckFanSpecifications = specifications.filter(({ radialVariant, bundleBias, pairSeparation, liftVariant }) =>
    radialVariant === 2
    && bundleBias === 0
    && pairSeparation === 0.1
    && (liftVariant.key === "-1" || liftVariant.key === "1"));
  // Crowded four-cycles often need a local deck adjustment together with the
  // radial-5 central collar. Put those moderate-separation specifications on
  // the bounded frontier before spending attempts on more extreme biases.
  const principalFanSpecifications = specifications.filter(({ radialVariant, bundleBias, pairSeparation, liftVariant }) =>
    radialVariant === 0 && Math.abs(bundleBias) === 0.75 && pairSeparation === 0.1 && liftVariant.key === "principal");
  const neutralDeckFanSpecifications = specifications.filter(({ radialVariant, bundleBias, pairSeparation, liftVariant }) =>
    (radialVariant === 0 || radialVariant === 2) && bundleBias === 0 && pairSeparation === 0.28 && (liftVariant.key === "-1" || liftVariant.key === "1"));
  const crowdedSpecifications = corridor.cycle.length === 4
    ? specifications.filter(({ radialVariant, bundleBias, pairSeparation, liftVariant }) =>
      radialVariant === 5
      && Math.abs(bundleBias) >= 1.1
      && pairSeparation === 0.28
      && liftVariant.key.startsWith("0:"))
    : [];
  const preferredSet = new Set([...centralDeckFanSpecifications, ...principalFanSpecifications, ...neutralDeckFanSpecifications, ...crowdedSpecifications]);
  const orderedSpecifications = [
    ...centralDeckFanSpecifications,
    ...principalFanSpecifications,
    ...neutralDeckFanSpecifications,
    ...crowdedSpecifications,
    ...specifications.filter((specification) => !preferredSet.has(specification)),
  ];
  // Rejected through specifications count against a fixed attempt allowance;
  // the retained frontier remains capped independently at maxBundles.
  const selectedSpecifications = boundedCandidates(orderedSpecifications, maxBundles * 2, ({ bundleBias, pairSeparation }) =>
    Math.abs(bundleBias) >= 1.9 && pairSeparation === 0.1, true);
  for (const { radialVariant, bundleBias, pairSeparation, liftVariant } of selectedSpecifications) {
      if (acceptedBundleCount >= maxBundles) break;
      if (budget.validationExhausted || budget.validationChecks >= budget.validationLimit) break;
      if (!reserveCandidateBundle(budget, edges.length, sampleCount)) break;
      const lifts = liftVariant.lifts ?? liftRecord(layout, seam, corridor, liftVariant.uniform, liftVariant.local);
        const routes = edges.map((edge) => {
          const edgeBias = corridor.cycle.length === 2
            ? (edge.edgeIndex === 0 ? pairSeparation : -pairSeparation)
            : corridorBias + bundleBias + (edge.edgeIndex - (corridor.cycle.length - 1) / 2) * pairSeparation;
          const route = throughRoute(layout, edge, lifts, edgeBias, radialVariant);
          const deckCost = Math.abs(liftVariant.uniform) + Object.values(liftVariant.local).reduce((sum, value) => sum + Math.abs(value), 0);
          return candidate(layout, edge, route, 0, deckCost * 2 + Math.abs(edgeBias), `through:${liftVariant.key}:${edgeBias}`, sampleCount, "cover-cubic");
        });
        const key = `through:${liftVariant.key}:${radialVariant}:${bundleBias}:${pairSeparation}`;
        const nonPrincipalThroughCount = routes.filter((route) => route.isPrincipalThroughRoute === false).length;
        const throughAngularTravel = routes.reduce((sum, route) => sum + (route.principalWinding === undefined ? 0 : Math.abs(route.route.angularDisplacement)), 0);
        const geometricLength = routes.reduce((sum, route) => sum + (route.routeLength ?? 0), 0);
        if ((homotopyPolicy === "all" || (homotopyPolicy === "principal-only" ? nonPrincipalThroughCount === 0 : nonPrincipalThroughCount > 0)) && routesAreInternallyValid(routes, hardClearance, endpointRadius, budget)) {
          acceptedBundleCount += 1;
          yield Object.freeze({
          cycleIndex: corridor.cycleIndex,
          corridor,
          vertexLifts: lifts,
          routes: Object.freeze(routes),
          score: routes.reduce((sum, route) => sum + route.localScore, 0),
          key,
          internallyValidated: true,
          nonPrincipalThroughCount,
          throughAngularTravel,
          geometricLength,
          });
        } else budget.rejectedBundles += 1;
  }
}

/**
 * A memoizing, pull-based view of one cycle's route bundles. Constructing the
 * frontier only ranks lightweight specifications. Route objects and their
 * sample arrays are materialized, validated, and charged to the call-wide
 * governor when `take` first crosses their position.
 */
export class CycleBundleFrontier {
  readonly maximumSize: number;
  private readonly source: Iterator<CycleRouteBundle>;
  private readonly compare?: (first: CycleRouteBundle, second: CycleRouteBundle) => number;
  private readonly cache: CycleRouteBundle[] = [];
  private sourceExhausted = false;

  constructor(maximumSize: number, source: Iterable<CycleRouteBundle>, compare?: (first: CycleRouteBundle, second: CycleRouteBundle) => number) {
    this.maximumSize = maximumSize;
    this.source = source[Symbol.iterator]();
    this.compare = compare;
  }

  get materializedSize(): number { return this.cache.length; }
  get exhausted(): boolean { return this.sourceExhausted; }

  take(count: number): readonly CycleRouteBundle[] {
    if (!Number.isInteger(count) || count < 0 || count > this.maximumSize) {
      throw new RangeError(`frontier count must be an integer in [0,${this.maximumSize}]`);
    }
    while (!this.sourceExhausted && this.cache.length < count) {
      const next = this.source.next();
      if (next.done) this.sourceExhausted = true;
      else {
        this.cache.push(next.value);
        if (this.compare) this.cache.sort(this.compare);
      }
    }
    return Object.freeze(this.cache.slice(0, count));
  }
}

export function createCycleBundleFrontier(
  layout: AnnularLayout,
  seam: SeamState,
  corridor: CycleCorridor,
  edges: readonly AnnularDirectedEdge[],
  sampleCount: number = ROUTING_POLICY.renderSampleCount,
  throughHomotopyPolicy: "all" | "principal-only" | "nonprincipal-only" = "all",
  maxCandidatesPerEdge: number = ROUTING_POLICY.maxCandidatesPerEdge,
  hardClearance: number = ROUTING_POLICY.hardClearance,
  endpointRadius: number = ROUTING_POLICY.commonEndpointRadius,
  generationBudget: CandidateGenerationBudget = createCandidateGenerationBudget(),
): CycleBundleFrontier {
  if (!Number.isInteger(sampleCount) || sampleCount < 2 || sampleCount > ROUTING_POLICY.maximumRenderSampleCount) throw new RangeError(`sample count must be an integer in [2,${ROUTING_POLICY.maximumRenderSampleCount}]`);
  if (!Number.isInteger(maxCandidatesPerEdge) || maxCandidatesPerEdge < 1 || maxCandidatesPerEdge > ROUTING_POLICY.maximumCandidatesPerEdge) throw new RangeError(`maximum candidates per edge must be an integer in [1,${ROUTING_POLICY.maximumCandidatesPerEdge}]`);
  const maxBundles = Math.max(1, Math.floor(maxCandidatesPerEdge));
  const source = corridor.kind === "through"
    ? throughBundleSource(layout, seam, corridor, edges, sampleCount, throughHomotopyPolicy, maxBundles, hardClearance, endpointRadius, generationBudget)
    : pureBundleSource(layout, seam, corridor, edges, sampleCount, maxBundles, generationBudget);
  const compare = corridor.kind === "through"
    ? (first: CycleRouteBundle, second: CycleRouteBundle): number =>
      (first.nonPrincipalThroughCount ?? 0) - (second.nonPrincipalThroughCount ?? 0)
      || (first.throughAngularTravel ?? 0) - (second.throughAngularTravel ?? 0)
      || (first.geometricLength ?? 0) - (second.geometricLength ?? 0)
      || first.score - second.score
      || first.key.localeCompare(second.key)
    : undefined;
  return new CycleBundleFrontier(maxBundles, source, compare);
}

export function generateCycleBundles(
  layout: AnnularLayout,
  seam: SeamState,
  corridor: CycleCorridor,
  edges: readonly AnnularDirectedEdge[],
  sampleCount: number = ROUTING_POLICY.renderSampleCount,
  throughHomotopyPolicy: "all" | "principal-only" | "nonprincipal-only" = "all",
  maxCandidatesPerEdge: number = ROUTING_POLICY.maxCandidatesPerEdge,
  hardClearance: number = ROUTING_POLICY.hardClearance,
  endpointRadius: number = ROUTING_POLICY.commonEndpointRadius,
  generationBudget: CandidateGenerationBudget = createCandidateGenerationBudget(),
): readonly CycleRouteBundle[] {
  return createCycleBundleFrontier(
    layout, seam, corridor, edges, sampleCount, throughHomotopyPolicy,
    maxCandidatesPerEdge, hardClearance, endpointRadius, generationBudget,
  ).take(maxCandidatesPerEdge);
}
