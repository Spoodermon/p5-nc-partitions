import type { DiagramModel } from "../geometry/types";
import { partitionToPermutation, permutationCycles } from "../math/permutation";
import { partitionToString } from "../math/serialize";
import type { DiscPartition } from "../math/types";

export function partitionDiagram(partition: DiscPartition): DiagramModel {
  return Object.freeze({
    notation: partitionToString(partition),
    vertexCount: partition.n,
    cycles: permutationCycles(partitionToPermutation(partition)),
  });
}
