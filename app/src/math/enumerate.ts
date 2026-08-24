import { createDiscPartition } from "./partition";
import type { DiscPartition } from "./types";

export function generateSetPartitions(n: number): readonly DiscPartition[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("n must be a positive integer");

  const restrictedGrowth = new Array<number>(n).fill(0);
  const partitions: DiscPartition[] = [];

  const visit = (position: number, maximumBlock: number): void => {
    if (position === n) {
      const blocks = Array.from({ length: maximumBlock + 1 }, () => [] as number[]);
      restrictedGrowth.forEach((blockIndex, labelIndex) => blocks[blockIndex]?.push(labelIndex + 1));
      const result = createDiscPartition(blocks);
      if (!result.ok) throw new Error(`Generated invalid partition: ${result.error.kind}`);
      partitions.push(result.value);
      return;
    }

    for (let blockIndex = 0; blockIndex <= maximumBlock + 1; blockIndex += 1) {
      restrictedGrowth[position] = blockIndex;
      visit(position + 1, Math.max(maximumBlock, blockIndex));
    }
  };

  restrictedGrowth[0] = 0;
  visit(1, 0);
  return Object.freeze(partitions);
}
