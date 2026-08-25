import { classifiedAnnularCycles, type AnnularPermutation } from "../../math/annular";
import { boundaryPosition } from "./seams";
import type { CycleCorridor, SeamState } from "./types";

export const OUTER_COLLAR_FLOOR = 0.74;
export const INNER_COLLAR_CEILING = 0.26;

interface PureSpan {
  readonly cycleIndex: number;
  readonly boundary: "outer" | "inner";
  readonly start: number;
  readonly end: number;
}

function pureSpans(value: AnnularPermutation, seam: SeamState): readonly PureSpan[] {
  return classifiedAnnularCycles(value).flatMap(({ cycle, kind }, cycleIndex) => {
    if (kind === "through") return [];
    const ranks = cycle.map((label) => boundaryPosition(seam, label, value.p).rank);
    return [{ cycleIndex, boundary: kind, start: Math.min(...ranks), end: Math.max(...ranks) }];
  });
}

function interleave(first: PureSpan, second: PureSpan): boolean {
  if (first.boundary !== second.boundary) return false;
  return (first.start < second.start && second.start < first.end && first.end < second.end)
    || (second.start < first.start && first.start < second.end && second.end < first.end);
}

export function seamHasPlanarPureSpans(value: AnnularPermutation, seam: SeamState): boolean {
  const spans = pureSpans(value, seam);
  for (let first = 0; first < spans.length; first += 1) {
    for (let second = first + 1; second < spans.length; second += 1) {
      if (interleave(spans[first] as PureSpan, spans[second] as PureSpan)) return false;
    }
  }
  return true;
}

export function createCycleCorridors(value: AnnularPermutation, seam: SeamState): readonly CycleCorridor[] {
  const cycles = classifiedAnnularCycles(value);
  const spans = pureSpans(value, seam);
  return Object.freeze(cycles.map(({ cycle, kind }, cycleIndex) => {
    const ownSpan = spans.find((span) => span.cycleIndex === cycleIndex);
    const nestingDepth = ownSpan === undefined ? 0 : spans.filter((span) =>
      span.boundary === ownSpan.boundary
      && span.cycleIndex !== ownSpan.cycleIndex
      && span.start <= ownSpan.start
      && span.end >= ownSpan.end
      && (span.start < ownSpan.start || span.end > ownSpan.end),
    ).length;
    return Object.freeze({
      cycleIndex,
      cycle,
      kind: kind === "outer" ? "outer-collar" : kind === "inner" ? "inner-collar" : "through",
      nestingDepth,
      span: ownSpan ? Object.freeze([ownSpan.start, ownSpan.end] as const) : null,
      lowerCoverHeight: kind === "outer" ? OUTER_COLLAR_FLOOR : 0,
      upperCoverHeight: kind === "inner" ? INNER_COLLAR_CEILING : 1,
    });
  }));
}

