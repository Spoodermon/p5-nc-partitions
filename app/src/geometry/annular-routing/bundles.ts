import {
  createAnnularRoute,
  createCoverCubicAnnularRoute,
  sampleAnnularRoute,
  type AnnularLayout,
  type AnnularRoute,
} from "../annular";
import { boundaryPosition } from "./seams";
import type {
  AnnularDirectedEdge,
  AnnularRouteCandidate,
  CycleCorridor,
  CycleRouteBundle,
  SeamState,
} from "./types";

const TWO_PI = 2 * Math.PI;
const DEFAULT_STROKE_WIDTH = 4;

function candidate(
  edge: AnnularDirectedEdge,
  route: AnnularRoute,
  lane: number,
  localScore: number,
  key: string,
  sampleCount: number,
  family: "analytical-bump" | "cover-cubic",
): AnnularRouteCandidate {
  return Object.freeze({
    edge,
    winding: route.winding,
    lane,
    excursion: route.excursion,
    angularBias: route.angularBias,
    route,
    samples: sampleAnnularRoute(route, sampleCount),
    localScore,
    key,
    routeFamily: family,
    strokeWidth: DEFAULT_STROKE_WIDTH,
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
  const end = rawEnd + edgeDeckOffset * TWO_PI;
  const displacement = end - start;
  const baseDepth = 0.04 + corridor.nestingDepth * 0.03 + laneVariant * 0.02;
  // Longer boundary intervals form the inner side of a contractible collar
  // polygon. Giving them a deeper radial lane prevents the complementary
  // short edges from cutting across them; the ordering is derived from the
  // lifted interval rather than from the arbitrary cycle return edge.
  const spanFraction = Math.min(1, Math.abs(displacement) / TWO_PI);
  const spanDepth = edge.cycleLength === 2
    ? (edge.edgeIndex === 0 ? 0.23 : 0.02)
    : Math.min(0.23, 1.84 * spanFraction ** 3);
  const depth = Math.min(0.27, baseDepth + Math.abs(edgeDeckOffset) * 0.1 + spanDepth);
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
      control1: { theta: start + displacement * 0.18 + centralBias * biasScale - endpointFan, u: startU },
      control2: { theta: start + displacement * 0.82 + centralBias * biasScale + endpointFan, u: endU },
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
): readonly CycleRouteBundle[] {
  const lifts = liftRecord(layout, seam, corridor);
  if (edges.length === 1 && edges[0]?.role === "singleton") {
    const edge = edges[0];
    const variants: CycleRouteBundle[] = [];
    for (const excursion of [0.005, 0.05, 0.14, 0.25]) for (const angularBias of [0.015, -0.015, 0.12, -0.12, 0.36, -0.36]) {
      const route = createAnnularRoute(layout, {
        startLabel: edge.startLabel,
        endLabel: edge.endLabel,
        excursion,
        angularBias,
      });
      const localScore = excursion + Math.abs(angularBias) * 0.1;
      const routed = candidate(edge, route, 0, localScore, `singleton:${excursion}:${angularBias}`, sampleCount, "analytical-bump");
      variants.push(Object.freeze({ cycleIndex: corridor.cycleIndex, corridor, vertexLifts: lifts, routes: Object.freeze([routed]), score: routed.localScore, key: routed.key }));
    }
    return Object.freeze(variants.sort((a, b) => a.score - b.score || a.key.localeCompare(b.key)));
  }
  const bundles: CycleRouteBundle[] = [];
  const patterns: number[][] = [Array(edges.length).fill(0)];
  for (let first = 0; first < edges.length; first += 1) {
    for (const sign of [-1, 1]) {
      const single = Array(edges.length).fill(0); single[first] = sign; patterns.push(single);
    }
    for (let second = 0; second < edges.length; second += 1) if (first !== second) {
      const paired = Array(edges.length).fill(0); paired[first] = -1; paired[second] = 1; patterns.push(paired);
    }
  }
  for (const edgeDeckOffsets of patterns) {
   for (const laneVariant of [0, 1, 2]) {
    for (const edgeSpacing of [0, 0.16, 0.28]) {
      const routes = edges.map((edge) => {
        const pairedBias = edge.cycleLength === 2 ? 0 : (edge.edgeIndex - (edge.cycleLength - 1) / 2) * edgeSpacing;
        const route = pureRoute(layout, edge, lifts, corridor, laneVariant, pairedBias, edgeDeckOffsets[edge.edgeIndex] ?? 0);
        return candidate(edge, route, laneVariant + (edge.role === "return" ? 1 : 0), laneVariant + Math.abs(pairedBias), `pure:${laneVariant}:${pairedBias}`, sampleCount, "cover-cubic");
      });
      const key = `pure:${edgeDeckOffsets.join(",")}:${laneVariant}:${edgeSpacing}`;
      bundles.push(Object.freeze({ cycleIndex: corridor.cycleIndex, corridor, vertexLifts: lifts, routes: Object.freeze(routes), score: routes.reduce((sum, route) => sum + route.localScore, 0), key }));
    }
   }
  }
  return Object.freeze(bundles.sort((a, b) => a.score - b.score || a.key.localeCompare(b.key)));
}

function throughBundles(
  layout: AnnularLayout,
  seam: SeamState,
  corridor: CycleCorridor,
  edges: readonly AnnularDirectedEdge[],
  sampleCount: number,
): readonly CycleRouteBundle[] {
  const bundles: CycleRouteBundle[] = [];
  const corridorBias = corridor.cycleIndex * 0.18;
  const innerLabels = corridor.cycle.filter((label) => label > layout.p);
  const deckLabels = corridor.cycle.length >= 4
    ? [...corridor.cycle]
    : innerLabels.length > 1 ? innerLabels : corridor.cycle.filter((label) => label <= layout.p);
  const liftVariants: Array<{ key: string; uniform: number; local: Record<number, number> }> = [-1, 0, 1]
    .map((uniform) => ({ key: `${uniform}`, uniform, local: {} }));
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
  const bundleBiases = corridor.cycle.length === 3
    ? [0, 0.15, -0.15, 0.3, -0.3, 0.5, -0.5, 0.75, -0.75, 1.1, -1.1, 1.5, -1.5, 1.9, -1.9]
    : [0, 0.3, -0.3, 0.75, -0.75, 1.1, -1.1, 1.5, -1.5, 1.9, -1.9, 2.4, -2.4];
  const separations = corridor.cycle.length === 2
    ? [0.1, 0.24, 0.5, 0.7, 1, 1.3]
    : corridor.cycle.length === 3 ? [0.1, 0.18, 0.28, 0.4, 0.6, 0.85, 1.1, 1.4] : [0.1, 0.28, 0.6, 1.1, 1.8, 2.2, 2.8];
  for (const liftVariant of liftVariants) {
    const lifts = liftRecord(layout, seam, corridor, liftVariant.uniform, liftVariant.local);
    for (const radialVariant of radialVariants) for (const bundleBias of bundleBiases) {
      for (const pairSeparation of separations) {
        const routes = edges.map((edge) => {
          const edgeBias = corridor.cycle.length === 2
            ? corridorBias + bundleBias + (edge.edgeIndex === 0 ? pairSeparation : -pairSeparation)
            : corridorBias + bundleBias + (edge.edgeIndex - (corridor.cycle.length - 1) / 2) * pairSeparation;
          const route = throughRoute(layout, edge, lifts, edgeBias, radialVariant);
          const deckCost = Math.abs(liftVariant.uniform) + Object.values(liftVariant.local).reduce((sum, value) => sum + Math.abs(value), 0);
          return candidate(edge, route, 0, deckCost * 2 + Math.abs(edgeBias), `through:${liftVariant.key}:${edgeBias}`, sampleCount, "cover-cubic");
        });
        const key = `through:${liftVariant.key}:${radialVariant}:${bundleBias}:${pairSeparation}`;
        bundles.push(Object.freeze({ cycleIndex: corridor.cycleIndex, corridor, vertexLifts: lifts, routes: Object.freeze(routes), score: routes.reduce((sum, route) => sum + route.localScore, 0), key }));
      }
    }
  }
  return Object.freeze(bundles.sort((a, b) => a.score - b.score || a.key.localeCompare(b.key)));
}

export function generateCycleBundles(
  layout: AnnularLayout,
  seam: SeamState,
  corridor: CycleCorridor,
  edges: readonly AnnularDirectedEdge[],
  sampleCount = 65,
): readonly CycleRouteBundle[] {
  return corridor.kind === "through"
    ? throughBundles(layout, seam, corridor, edges, sampleCount)
    : pureBundles(layout, seam, corridor, edges, sampleCount);
}
