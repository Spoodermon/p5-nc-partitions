import { permutationCycles } from "./permutation";
import type { DiscPartition, MathError, Permutation } from "./types";

export function partitionToString(partition: DiscPartition): string {
  return partition.blocks.map((block) => `(${block.join(" ")})`).join("");
}

export function permutationToCycleString(permutation: Permutation): string {
  return permutationCycles(permutation).map((cycle) => `(${cycle.join(" ")})`).join("");
}

export function mathErrorMessage(error: MathError): string {
  switch (error.kind) {
    case "empty-input":
      return "Enter a nonempty partition.";
    case "malformed-syntax":
      return `${error.message} (position ${error.position + 1}).`;
    case "non-integer-label":
      return `Expected an integer label near “${error.token}” (position ${error.position + 1}).`;
    case "non-positive-label":
      return `Labels must be positive; found ${error.label}.`;
    case "duplicate-label":
      return `Label ${error.label} appears more than once.`;
    case "missing-support":
      return `Support must be [1,n]; missing ${error.missing.join(", ")}.`;
    case "crossing-partition":
      return `The partition is crossing (witness ${error.witness.join(" < ")}).`;
    case "invalid-permutation":
      return error.message;
  }
}
