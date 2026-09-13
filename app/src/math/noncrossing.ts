import { failure, success, type Block, type DiscPartition, type Result } from "./types";

/** Unique edges of the convex polygon spanned by a block; total edges are O(n). */
function boundaryChords(block: Block): readonly (readonly [number, number])[] {
  if (block.length < 2) return Object.freeze([]);
  if (block.length === 2) return Object.freeze([[block[0] as number, block[1] as number] as const]);
  const result: Array<readonly [number, number]> = [];
  for (let index = 0; index < block.length; index += 1) {
    const first = block[index] as number;
    const second = block[(index + 1) % block.length] as number;
    result.push(first < second ? [first, second] : [second, first]);
  }
  return Object.freeze(result);
}

export function crossingWitness(partition: DiscPartition): readonly [number, number, number, number] | null {
  for (let firstBlock = 0; firstBlock < partition.blocks.length; firstBlock += 1) {
    for (let secondBlock = firstBlock + 1; secondBlock < partition.blocks.length; secondBlock += 1) {
      const left = partition.blocks[firstBlock];
      const right = partition.blocks[secondBlock];
      if (!left || !right) continue;

      for (const [a, c] of boundaryChords(left)) {
        for (const [b, d] of boundaryChords(right)) {
          if (a < b && b < c && c < d) return Object.freeze([a, b, c, d]);
          if (b < a && a < d && d < c) return Object.freeze([b, a, d, c]);
        }
      }
    }
  }
  return null;
}

export function isNoncrossing(partition: DiscPartition): boolean {
  return crossingWitness(partition) === null;
}

export function noncrossingResult(partition: DiscPartition): Result<DiscPartition> {
  const witness = crossingWitness(partition);
  return witness ? failure({ kind: "crossing-partition", witness }) : success(partition);
}
