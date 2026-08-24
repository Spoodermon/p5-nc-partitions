import type { AnnularPermutation } from "../../math/annular";
import { defaultAnnularPhase, leastCommonMultiple } from "../annular";
import type { AnnularDirectedEdge } from "./types";

const TWO_PI = 2 * Math.PI;

export function wrapAngle(value: number): number {
  return ((value + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
}

export function annularPhaseCandidates(p: number, q: number, count = 9): readonly number[] {
  if (!Number.isInteger(count) || count < 2 || count > 65) throw new RangeError("phase candidate count must be in [2,65]");
  const period = TWO_PI / leastCommonMultiple(p, q);
  const values = Array.from({ length: count }, (_, index) => (period * index) / count);
  values.push(defaultAnnularPhase(p, q) % period);
  return Object.freeze(values
    .sort((a, b) => a - b)
    .filter((value, index, sorted) => index === 0 || Math.abs(value - (sorted[index - 1] as number)) > 1e-12));
}

function outerAngle(label: number, p: number): number {
  return -Math.PI / 2 + (TWO_PI * (label - 1)) / p;
}

function innerAngle(label: number, value: AnnularPermutation, phase: number): number {
  return -Math.PI / 2 + phase - (TWO_PI * (label - value.p - 1)) / value.q;
}

// Through strings are happiest in a broad 0.3..1.45 radian sweep band: neither
// radial nor nearly tangential. The geometric solver remains the dominant score.
export function endpointPhasePenalty(
  value: AnnularPermutation,
  edges: readonly AnnularDirectedEdge[],
  phase: number,
): number {
  const differences = edges.filter((edge) => edge.kind === "through").map((edge) => {
    const outer = edge.startBoundary === "outer" ? edge.startLabel : edge.endLabel;
    const inner = edge.startBoundary === "inner" ? edge.startLabel : edge.endLabel;
    return Math.abs(wrapAngle(outerAngle(outer, value.p) - innerAngle(inner, value, phase)));
  });
  if (differences.length === 0) return Math.abs(phase - defaultAnnularPhase(value.p, value.q)) * 0.02;
  return differences.reduce((sum, delta) => {
    const radial = Math.max(0, 0.3 - delta);
    const tangential = Math.max(0, delta - 1.45);
    return sum + radial * radial * 30 + tangential * tangential * 2;
  }, 0);
}
