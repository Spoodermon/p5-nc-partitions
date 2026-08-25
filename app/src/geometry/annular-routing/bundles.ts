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

function routesAreInternallyValid(routes: readonly AnnularRouteCandidate[], hardClearance: number, endpointRadius: number): boolean {
  for (let first = 0; first < routes.length; first += 1) for (let second = first + 1; second < routes.length; second += 1) {
    if (routesConflict(routes[first] as AnnularRouteCandidate, routes[second] as AnnularRouteCandidate, hardClearance, endpointRadius)) return false;
  }
  return true;
}

function boundedCandidates<T>(ordered: readonly T[], limit: number, reserve?: (value: T) => boolean): readonly T[] {
  if (ordered.length <= limit) return ordered;
  const selected = new Set<number>();
  if (reserve) ordered.forEach((value, index) => { if (reserve(value)) selected.add(index); });
  if (selected.size > limit) {
    const reserved = [...selected]; selected.clear();
    for (let index = 0; index < limit; index += 1) selected.add(reserved[Math.round(index * (reserved.length - 1) / Math.max(1, limit - 1))] as number);
  }
  const preferredTarget = Math.max(1, Math.floor(limit * 0.75));
  for (let index = 0; index < ordered.length && selected.size < preferredTarget; index += 1) selected.add(index);
  const coverageTarget = limit - selected.size;
  for (let index = 0; index < coverageTarget; index += 1) {
    const fraction = coverageTarget === 1 ? 1 : index / (coverageTarget - 1);
    selected.add(Math.round(fraction * (ordered.length - 1)));
  }
  for (let index = 0; index < ordered.length && selected.size < limit; index += 1) selected.add(index);
  return [...selected].sort((a, b) => a - b).map((index) => ordered[index] as T);
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
  let end = rawEnd + edgeDeckOffset * TWO_PI;
  const effectiveDeckOffset = edgeDeckOffset;
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
  } else if (edge.cycleLength > 2 && followsContiguousBoundaryChain(layout, corridor)) {
    // A pure boundary cycle is a ribbon around an open angular chain.  Its
    // first n-1 edges advance in the boundary's native direction; the closing
    // edge retraces that whole chain in reverse on a deeper radial lane.  It
    // must not close across the complementary interval, where an omitted
    // singleton or another collar may live.
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
    // Collision-avoidance deck fallbacks may add a turn, but never reverse the
    // established orientation of this edge.
    displacement += Math.sign(displacement) * Math.abs(edgeDeckOffset) * TWO_PI;
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
      : (edge.edgeIndex === 0 ? 0.23 : 0.02)
    : edge.role === "return"
      ? Math.min(0.42, 1.84 * spanFraction ** 3)
      : Math.min(0.23, 1.84 * spanFraction ** 3);
  const maximumDepth = edge.cycleLength === 2 || edge.role === "return" ? 0.5 : 0.27;
  const depth = Math.min(maximumDepth, baseDepth + Math.abs(effectiveDeckOffset) * 0.1 + spanDepth);
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
    return createCoverCubicAnnularRoute(layout, {
      startLabel: edge.startLabel,
      endLabel: edge.endLabel,
      startLiftAngle: start,
      endLiftAngle: end,
      control1: { theta: start + displacement * 0.22 + centralBias * biasScale - endpointFan, u: startU },
      control2: { theta: start + displacement * 0.78 + centralBias * biasScale + endpointFan, u: endU },
    });
  }
  const spanFraction = Math.min(1, Math.abs(displacement) / TWO_PI);
  const collarDepth = radialVariant === 0
    ? Math.min(0.27, 0.05 + 1.8 * spanFraction ** 3)
    : radialVariant === 5 ? 0.15 : Math.min(0.48, 0.38 + 0.4 * spanFraction ** 3);
  const centralU = edge.startBoundary === "outer" ? 1 - collarDepth : collarDepth;
  return createCoverCubicAnnularRoute(layout, {
    startLabel: edge.startLabel,
    endLabel: edge.endLabel,
    startLiftAngle: start,
    endLiftAngle: end,
    control1: { theta: start + centralBias * biasScale - sameBoundaryFan, u: centralU },
    control2: { theta: end + centralBias * biasScale + sameBoundaryFan, u: centralU },
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

function pureBundles(
  layout: AnnularLayout,
  seam: SeamState,
  corridor: CycleCorridor,
  edges: readonly AnnularDirectedEdge[],
  sampleCount: number,
  maxBundles: number,
): readonly CycleRouteBundle[] {
  const lifts = liftRecord(layout, seam, corridor);
  if (edges.length === 1 && edges[0]?.role === "singleton") {
    const edge = edges[0];
    const variants: CycleRouteBundle[] = [];
    for (const excursion of [0.03, 0.05, 0.08, 0.1, 0.14, 0.19, 0.25]) for (const angularBias of [0.08, -0.08, 0.12, -0.12, 0.16, -0.16, 0.24, -0.24, 0.34, -0.34]) {
      const route = createAnnularRoute(layout, {
        startLabel: edge.startLabel,
        endLabel: edge.endLabel,
        excursion,
        angularBias,
      });
      const localScore = Math.abs(excursion - 0.14) + Math.abs(Math.abs(angularBias) - 0.16) * 0.1;
      const routed = candidate(layout, edge, route, 0, localScore, `singleton:${excursion}:${angularBias}`, sampleCount, "analytical-bump");
      variants.push(Object.freeze({ cycleIndex: corridor.cycleIndex, corridor, vertexLifts: lifts, routes: Object.freeze([routed]), score: routed.localScore, key: routed.key }));
    }
    return Object.freeze(boundedCandidates(variants.sort((a, b) => a.score - b.score || a.key.localeCompare(b.key)), maxBundles));
  }
  const bundles: CycleRouteBundle[] = [];
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
  for (const edgeDeckOffsets of patterns) {
   for (const laneVariant of isTwoCycle ? [0, 1, 2, 3] : [0, 1, 2]) {
    for (const edgeSpacing of isTwoCycle ? [0, 0.28, -0.28, 0.75, -0.75] : [0, 0.16, 0.28]) {
      const routes = edges.map((edge) => {
        const pairedBias = edge.cycleLength === 2 ? edgeSpacing : (edge.edgeIndex - (edge.cycleLength - 1) / 2) * edgeSpacing;
        const route = pureRoute(layout, edge, lifts, corridor, laneVariant, pairedBias, edgeDeckOffsets[edge.edgeIndex] ?? 0);
        const preservesChainRibbon = edge.cycleLength === 2 || followsContiguousBoundaryChain(layout, corridor);
        const homotopyPenalty = preservesChainRibbon ? Math.abs(edgeDeckOffsets[edge.edgeIndex] ?? 0) * 2 : 0;
        return candidate(layout, edge, route, laneVariant + (edge.role === "return" ? 1 : 0), laneVariant + Math.abs(pairedBias) + homotopyPenalty, `pure:${laneVariant}:${pairedBias}`, sampleCount, "cover-cubic");
      });
      const key = `pure:${edgeDeckOffsets.join(",")}:${laneVariant}:${edgeSpacing}`;
      bundles.push(Object.freeze({ cycleIndex: corridor.cycleIndex, corridor, vertexLifts: lifts, routes: Object.freeze(routes), score: routes.reduce((sum, route) => sum + route.localScore, 0), key }));
    }
   }
  }
  return Object.freeze(boundedCandidates(bundles.sort((a, b) => a.score - b.score || a.key.localeCompare(b.key)), maxBundles));
}

function throughBundles(
  layout: AnnularLayout,
  seam: SeamState,
  corridor: CycleCorridor,
  edges: readonly AnnularDirectedEdge[],
  sampleCount: number,
  homotopyPolicy: "all" | "principal-only" | "nonprincipal-only",
  maxBundles: number,
  hardClearance: number,
  endpointRadius: number,
): readonly CycleRouteBundle[] {
  const bundles: CycleRouteBundle[] = [];
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
  generation: for (const { radialVariant, bundleBias, pairSeparation } of activeCombinations) {
    for (const liftVariant of activeLiftVariants) {
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
        if ((homotopyPolicy === "all" || (homotopyPolicy === "principal-only" ? nonPrincipalThroughCount === 0 : nonPrincipalThroughCount > 0)) && routesAreInternallyValid(routes, hardClearance, endpointRadius)) bundles.push(Object.freeze({
          cycleIndex: corridor.cycleIndex,
          corridor,
          vertexLifts: lifts,
          routes: Object.freeze(routes),
          score: routes.reduce((sum, route) => sum + route.localScore, 0),
          key,
          nonPrincipalThroughCount,
          throughAngularTravel,
          geometricLength,
        }));
        if (bundles.length >= maxBundles) break generation;
    }
  }
  return Object.freeze(boundedCandidates(bundles.sort((a, b) =>
    (a.nonPrincipalThroughCount ?? 0) - (b.nonPrincipalThroughCount ?? 0)
    || (a.throughAngularTravel ?? 0) - (b.throughAngularTravel ?? 0)
    || (a.geometricLength ?? 0) - (b.geometricLength ?? 0)
    || a.score - b.score
    || a.key.localeCompare(b.key)), maxBundles, (bundle) => /:(?:-?1\.9|-?2\.4):0\.1$/.test(bundle.key)));
}

export function generateCycleBundles(
  layout: AnnularLayout,
  seam: SeamState,
  corridor: CycleCorridor,
  edges: readonly AnnularDirectedEdge[],
  sampleCount = 65,
  throughHomotopyPolicy: "all" | "principal-only" | "nonprincipal-only" = "all",
  maxCandidatesPerEdge = 140,
  hardClearance = 7.5,
  endpointRadius = 24,
): readonly CycleRouteBundle[] {
  const maxBundles = Math.max(1, Math.floor(maxCandidatesPerEdge)) * Math.max(1, edges.length);
  return corridor.kind === "through"
    ? throughBundles(layout, seam, corridor, edges, sampleCount, throughHomotopyPolicy, maxBundles, hardClearance, endpointRadius)
    : pureBundles(layout, seam, corridor, edges, sampleCount, maxBundles);
}
