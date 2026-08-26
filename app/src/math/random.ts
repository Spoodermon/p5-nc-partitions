import { createDiscPartition } from "./partition";
import type { DiscPartition } from "./types";

export type RandomSource = () => number;

function randomBlocksInInterval(start: number, end: number, random: RandomSource): number[][] {
  if (start > end) return [];
  const root = [start];
  const inclusion = 0.18 + random() * 0.42;
  for (let label = start + 1; label <= end; label += 1) if (random() < inclusion) root.push(label);
  const blocks: number[][] = [root];
  for (let index = 0; index < root.length; index += 1) {
    const gapStart = (root[index] as number) + 1;
    const gapEnd = index + 1 < root.length ? (root[index + 1] as number) - 1 : end;
    blocks.push(...randomBlocksInInterval(gapStart, gapEnd, random));
  }
  return blocks;
}

export function randomNoncrossingPartition(n: number, random: RandomSource = Math.random): DiscPartition {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("n must be a positive integer");
  const created = createDiscPartition(randomBlocksInInterval(1, n, random));
  if (!created.ok) throw new Error(`Random partition invariant failed: ${created.error.kind}`);
  return created.value;
}

/** Build an admitted annular block set, optionally with one rooted through-block. */
export function randomAnnularBlockNotation(p: number, q: number, random: RandomSource = Math.random, throughProbability = 0.72): string {
  if (!Number.isInteger(p) || p < 1 || !Number.isInteger(q) || q < 1) throw new RangeError("p and q must be positive integers");
  const outer = randomBlocksInInterval(1, p, random);
  const inner = randomBlocksInInterval(p + 1, p + q, random);
  const blocks = random() < throughProbability
    ? [[...(outer[0] ?? []), ...(inner[0] ?? [])], ...outer.slice(1), ...inner.slice(1)]
    : [...outer, ...inner];
  return blocks.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0)).map((block) => `(${block.join(" ")})`).join("");
}
