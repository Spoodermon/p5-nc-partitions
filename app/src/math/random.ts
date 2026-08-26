import { INPUT_LIMITS } from "../config/limits";
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
  if (!Number.isSafeInteger(n) || n < 1 || n > INPUT_LIMITS.discSupport) throw new RangeError(`n must be an integer in [1,${INPUT_LIMITS.discSupport}]`);
  const created = createDiscPartition(randomBlocksInInterval(1, n, random));
  if (!created.ok) throw new Error(`Random partition invariant failed: ${created.error.kind}`);
  return created.value;
}

/** Build an admitted annular block set, optionally with one rooted through-block. */
export function randomAnnularBlockNotation(p: number, q: number, random: RandomSource = Math.random, throughProbability = 0.72): string {
  if (!Number.isSafeInteger(p) || p < 1 || !Number.isSafeInteger(q) || q < 1 || p > INPUT_LIMITS.annularP || q > INPUT_LIMITS.annularQ || p + q > INPUT_LIMITS.annularTotalSupport) {
    throw new RangeError("p and q exceed the supported annular limits");
  }
  const outer = randomBlocksInInterval(1, p, random);
  const inner = randomBlocksInInterval(p + 1, p + q, random);
  const blocks = random() < throughProbability
    ? [[...(outer[0] ?? []), ...(inner[0] ?? [])], ...outer.slice(1), ...inner.slice(1)]
    : [...outer, ...inner];
  return blocks.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0)).map((block) => `(${block.join(" ")})`).join("");
}
