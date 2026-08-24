import { permutationCycles } from "../permutation";
import { isAnnularConnected } from "./classify";
import { annularKrewerasComplement } from "./kreweras";
import type { AnnularNoncrossingAnalysis, AnnularPermutation } from "./types";

export function analyzeAnnularNoncrossing(value: AnnularPermutation): AnnularNoncrossingAnalysis {
  const connected = isAnnularConnected(value);
  const cycleCount = permutationCycles(value.permutation).length;
  const complementCycleCount = permutationCycles(annularKrewerasComplement(value).permutation).length;
  const expectedSum = value.p + value.q + (connected ? 0 : 2);
  const actualSum = cycleCount + complementCycleCount;
  return Object.freeze({
    connected,
    cycleCount,
    complementCycleCount,
    expectedSum,
    actualSum,
    isNoncrossing: actualSum === expectedSum,
  });
}

export function isAnnularNoncrossing(value: AnnularPermutation): boolean {
  return analyzeAnnularNoncrossing(value).isNoncrossing;
}
