import { permutationCycles } from "../../math/permutation";
import type { AnnularPermutation } from "../../math/annular";
import type { AnnularBoundary, AnnularRouteKind } from "../annular";
import type { AnnularDirectedEdge } from "./types";

function boundary(label: number, p: number): AnnularBoundary {
  return label <= p ? "outer" : "inner";
}

function kind(start: AnnularBoundary, end: AnnularBoundary, singleton: boolean): AnnularRouteKind {
  if (singleton) return start === "outer" ? "outer-singleton" : "inner-singleton";
  if (start !== end) return "through";
  return start === "outer" ? "outer-outer" : "inner-inner";
}

export function extractAnnularEdges(value: AnnularPermutation): readonly AnnularDirectedEdge[] {
  const edges: AnnularDirectedEdge[] = [];
  permutationCycles(value.permutation).forEach((cycle, cycleIndex) => {
    cycle.forEach((startLabel, edgeIndex) => {
      const endLabel = cycle[(edgeIndex + 1) % cycle.length] as number;
      const singleton = cycle.length === 1;
      const closesCycle = singleton || edgeIndex === cycle.length - 1;
      const startBoundary = boundary(startLabel, value.p);
      const endBoundary = boundary(endLabel, value.p);
      edges.push(Object.freeze({
        id: `c${cycleIndex + 1}e${edgeIndex + 1}:${startLabel}->${endLabel}`,
        cycleIndex,
        edgeIndex,
        cycleLength: cycle.length,
        startLabel,
        endLabel,
        startBoundary,
        endBoundary,
        kind: kind(startBoundary, endBoundary, singleton),
        role: singleton ? "singleton" : closesCycle ? "return" : "forward",
        closesCycle,
      }));
    });
  });
  return Object.freeze(edges);
}

