import { failure, success, type Block, type DiscPartition, type Result } from "./types";

function pairs(block: Block): readonly (readonly [number, number])[] {
  const result: [number, number][] = [];
  for (let first = 0; first < block.length; first += 1) {
    for (let second = first + 1; second < block.length; second += 1) {
      const a = block[first];
      const c = block[second];
      if (a !== undefined && c !== undefined) result.push([a, c]);
    }
  }
  return result;
}

export function crossingWitness(partition: DiscPartition): readonly [number, number, number, number] | null {
  for (let firstBlock = 0; firstBlock < partition.blocks.length; firstBlock += 1) {
    for (let secondBlock = firstBlock + 1; secondBlock < partition.blocks.length; secondBlock += 1) {
      const left = partition.blocks[firstBlock];
      const right = partition.blocks[secondBlock];
      if (!left || !right) continue;

      for (const [a, c] of pairs(left)) {
        for (const [b, d] of pairs(right)) {
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
