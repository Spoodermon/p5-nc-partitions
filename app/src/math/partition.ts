import { failure, success, type Block, type DiscPartition, type Permutation, type Result } from "./types";
import { permutationCycles } from "./permutation";

function compareBlocks(a: Block, b: Block): number {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

export function createDiscPartition(blocksInput: readonly (readonly number[])[]): Result<DiscPartition> {
  if (blocksInput.length === 0) return failure({ kind: "empty-input" });

  const seen = new Set<number>();
  const blocks: number[][] = [];
  let maximum = 0;

  for (const inputBlock of blocksInput) {
    if (inputBlock.length === 0) {
      return failure({ kind: "malformed-syntax", position: 0, message: "Blocks cannot be empty" });
    }

    const block: number[] = [];
    for (const label of inputBlock) {
      if (!Number.isInteger(label)) {
        return failure({ kind: "non-integer-label", position: 0, token: String(label) });
      }
      if (label < 1) return failure({ kind: "non-positive-label", position: 0, label });
      if (seen.has(label)) return failure({ kind: "duplicate-label", label });
      seen.add(label);
      maximum = Math.max(maximum, label);
      block.push(label);
    }
    block.sort((a, b) => a - b);
    blocks.push(block);
  }

  const missing = Array.from({ length: maximum }, (_, index) => index + 1).filter((label) => !seen.has(label));
  if (missing.length > 0) return failure({ kind: "missing-support", missing: Object.freeze(missing) });

  blocks.sort(compareBlocks);
  const frozenBlocks = Object.freeze(blocks.map((block) => Object.freeze([...block])));
  return success(Object.freeze({ n: maximum, blocks: frozenBlocks }));
}

export function partitionFromPermutation(permutation: Permutation): DiscPartition {
  const result = createDiscPartition(permutationCycles(permutation));
  if (!result.ok) throw new Error(`Valid permutation produced an invalid partition: ${result.error.kind}`);
  return result.value;
}

export function equalPartitions(a: DiscPartition, b: DiscPartition): boolean {
  if (a.n !== b.n || a.blocks.length !== b.blocks.length) return false;
  return a.blocks.every(
    (block, blockIndex) =>
      block.length === b.blocks[blockIndex]?.length &&
      block.every((label, labelIndex) => label === b.blocks[blockIndex]?.[labelIndex]),
  );
}
