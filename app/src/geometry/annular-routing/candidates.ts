import { createAnnularRoute, sampleAnnularRoute, type AnnularLayout } from "../annular";
import type { AnnularDirectedEdge, AnnularRouteCandidate } from "./types";

const SAME_BOUNDARY_EXCURSIONS = [0.1, 0.18, 0.3, 0.44, 0.6, 0.72, 0.84, 0.92] as const;
const SINGLETON_EXCURSIONS = [0.1, 0.14, 0.18] as const;
const WINDINGS = [-1, 0, 1] as const;

function candidateKey(winding: number, lane: number, excursion: number, angularBias: number): string {
  return `${winding}|${lane}|${excursion.toFixed(3)}|${angularBias.toFixed(3)}`;
}

function sameBoundaryBiases(edge: AnnularDirectedEdge): readonly number[] {
  if (edge.cycleLength === 2) return edge.edgeIndex === 0 ? [0.12, 0.2, -0.12] : [-0.12, -0.2, 0.12];
  return [0, 0.08, -0.08, 0.16, -0.16, 0.3, -0.3, 0.5, -0.5, 0.76, -0.76];
}

function throughBiases(edge: AnnularDirectedEdge): readonly number[] {
  if (edge.cycleLength === 2) {
    const sign = edge.edgeIndex === 0 ? 1 : -1;
    return [sign * 0.18, sign * 0.3, sign * 0.44, sign * 0.6, sign * 0.76, sign * 0.96, sign * 1.24, sign * 1.56, sign * 1.9, -sign * 0.18, -sign * 0.36, -sign * 0.62, -sign * 1.05];
  }
  const sign = edge.edgeIndex % 2 === 0 ? 1 : -1;
  return [0, sign * 0.12, sign * 0.24, -sign * 0.12, -sign * 0.24, sign * 0.38, -sign * 0.38, sign * 0.56, -sign * 0.56, sign * 0.78, -sign * 0.78, sign * 1.02, -sign * 1.02];
}

function singletonBiases(edge: AnnularDirectedEdge): readonly number[] {
  const sign = (edge.cycleIndex + (edge.startBoundary === "inner" ? 1 : 0)) % 2 === 0 ? 1 : -1;
  return [sign * 0.2, -sign * 0.2, sign * 0.28, -sign * 0.28];
}

function score(edge: AnnularDirectedEdge, winding: number, lane: number, bias: number, displacement: number): number {
  const preferredLane = edge.role === "return" ? 2 : 0;
  const hierarchy = Math.abs(lane - preferredLane) * 0.8;
  const desiredDirection = edge.startBoundary === "outer" ? 1 : -1;
  const orientationPenalty = edge.cycleLength > 2 && edge.kind !== "through" && displacement * desiredDirection < -1e-9 ? 18 : 0;
  return Math.abs(winding) * 2 + Math.abs(displacement) * 1.5 + lane * 0.45 + Math.abs(bias) * 0.8 + hierarchy + orientationPenalty;
}

export function generateRouteCandidates(
  layout: AnnularLayout,
  edge: AnnularDirectedEdge,
  sampleCount = 97,
  maximum = 36,
): readonly AnnularRouteCandidate[] {
  const specs: Array<{ winding: number; lane: number; excursion: number; angularBias: number }> = [];
  if (edge.role === "singleton") {
    SINGLETON_EXCURSIONS.forEach((excursion, lane) => singletonBiases(edge).forEach((angularBias) => {
      specs.push({ winding: 0, lane, excursion, angularBias });
    }));
  } else if (edge.kind === "through") {
    WINDINGS.forEach((winding) => throughBiases(edge).forEach((angularBias, lane) => {
      specs.push({ winding, lane, excursion: 0, angularBias });
    }));
  } else {
    WINDINGS.forEach((winding) => SAME_BOUNDARY_EXCURSIONS.forEach((excursion, lane) => {
      sameBoundaryBiases(edge).forEach((angularBias) => specs.push({ winding, lane, excursion, angularBias }));
    }));
  }

  return Object.freeze(specs.map((spec) => {
    const route = createAnnularRoute(layout, {
      startLabel: edge.startLabel,
      endLabel: edge.endLabel,
      winding: spec.winding,
      excursion: edge.kind === "through" ? 0.3 : spec.excursion,
      angularBias: spec.angularBias,
    });
    return Object.freeze({
      edge,
      ...spec,
      route,
      samples: sampleAnnularRoute(route, sampleCount),
      localScore: score(edge, spec.winding, spec.lane, spec.angularBias, route.angularDisplacement),
      key: candidateKey(spec.winding, spec.lane, spec.excursion, spec.angularBias),
    });
  }).sort((a, b) => a.localScore - b.localScore || a.key.localeCompare(b.key)).slice(0, maximum));
}
