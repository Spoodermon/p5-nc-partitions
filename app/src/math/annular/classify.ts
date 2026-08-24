import { permutationCycles } from "../permutation";
import type { AnnularPermutation, AnnularCycleKind, ClassifiedAnnularCycle } from "./types";

export function classifyAnnularCycle(p: number, cycle: readonly number[]): AnnularCycleKind {
  const hasOuter = cycle.some((label) => label <= p);
  const hasInner = cycle.some((label) => label > p);
  if (hasOuter && hasInner) return "through";
  return hasOuter ? "outer" : "inner";
}

export function classifiedAnnularCycles(value: AnnularPermutation): readonly ClassifiedAnnularCycle[] {
  return Object.freeze(
    permutationCycles(value.permutation).map((cycle) =>
      Object.freeze({ cycle, kind: classifyAnnularCycle(value.p, cycle) }),
    ),
  );
}

export function throughCycleCount(value: AnnularPermutation): number {
  return classifiedAnnularCycles(value).filter(({ kind }) => kind === "through").length;
}

export function isAnnularConnected(value: AnnularPermutation): boolean {
  return throughCycleCount(value) > 0;
}
