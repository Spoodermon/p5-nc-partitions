import type { RoutedAnnularSuccess } from "../geometry/annular-routing";
import { annularPermutationToString, classifiedAnnularCycles, type AnnularCycleKind, type AnnularPermutation } from "../math";

export interface AnnularDiagramCycle {
  readonly cycle: readonly number[];
  readonly kind: AnnularCycleKind;
}

export interface AnnularDiagramModel {
  readonly permutation: AnnularPermutation;
  readonly routed: RoutedAnnularSuccess;
  readonly notation: string;
  readonly cycles: readonly AnnularDiagramCycle[];
}

export function annularDiagram(permutation: AnnularPermutation, routed: RoutedAnnularSuccess): AnnularDiagramModel {
  if (routed.permutation !== permutation) throw new Error("Routed annular diagram does not belong to the supplied permutation");
  return Object.freeze({
    permutation,
    routed,
    notation: annularPermutationToString(permutation),
    cycles: classifiedAnnularCycles(permutation),
  });
}
