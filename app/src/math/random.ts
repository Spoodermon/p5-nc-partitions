import { INPUT_LIMITS } from "../config/limits";
import { analyzeAnnularNoncrossing } from "./annular/noncrossing";
import { parseAnnularPermutation } from "./annular/parser";
import type { AnnularPermutation } from "./annular/types";
import { createDiscPartition } from "./partition";
import type { DiscPartition } from "./types";

export type RandomSource = () => number;
export type AnnularRandomDensity = "sparse" | "balanced" | "dense";

interface BlockDensityProfile {
  readonly minimumInclusion: number;
  readonly maximumInclusion: number;
}

const BLOCK_DENSITIES: Readonly<Record<AnnularRandomDensity, BlockDensityProfile>> = Object.freeze({
  sparse: Object.freeze({ minimumInclusion: 0.04, maximumInclusion: 0.12 }),
  balanced: Object.freeze({ minimumInclusion: 0.2, maximumInclusion: 0.42 }),
  dense: Object.freeze({ minimumInclusion: 0.52, maximumInclusion: 0.82 }),
});
const DISC_BLOCK_DENSITY = Object.freeze({ minimumInclusion: 0.18, maximumInclusion: 0.6 });

function boundedRandom(random: RandomSource): number {
  const value = random();
  if (!Number.isFinite(value)) throw new RangeError("random source must return a finite number");
  return Math.max(0, Math.min(1 - Number.EPSILON, value));
}

function randomBlocksInInterval(
  start: number,
  end: number,
  random: RandomSource,
  profile: BlockDensityProfile = DISC_BLOCK_DENSITY,
): number[][] {
  if (start > end) return [];
  const root = [start];
  const inclusion = profile.minimumInclusion
    + boundedRandom(random) * (profile.maximumInclusion - profile.minimumInclusion);
  for (let label = start + 1; label <= end; label += 1) if (boundedRandom(random) < inclusion) root.push(label);
  const blocks: number[][] = [root];
  for (let index = 0; index < root.length; index += 1) {
    const gapStart = (root[index] as number) + 1;
    const gapEnd = index + 1 < root.length ? (root[index + 1] as number) - 1 : end;
    blocks.push(...randomBlocksInInterval(gapStart, gapEnd, random, profile));
  }
  return blocks;
}

export function randomNoncrossingPartition(n: number, random: RandomSource = Math.random): DiscPartition {
  if (!Number.isSafeInteger(n) || n < 1 || n > INPUT_LIMITS.discSupport) throw new RangeError(`n must be an integer in [1,${INPUT_LIMITS.discSupport}]`);
  const created = createDiscPartition(randomBlocksInInterval(1, n, random));
  if (!created.ok) throw new Error(`Random partition invariant failed: ${created.error.kind}`);
  return created.value;
}

/**
 * Legacy block-notation helper. Production Random ANC uses the strict,
 * connected permutation generator below; this remains for API compatibility.
 */
export function randomAnnularBlockNotation(
  p: number,
  q: number,
  random: RandomSource = Math.random,
  throughProbability = 0.72,
): string {
  if (!Number.isSafeInteger(p) || p < 1 || !Number.isSafeInteger(q) || q < 1 || p > INPUT_LIMITS.annularP || q > INPUT_LIMITS.annularQ || p + q > INPUT_LIMITS.annularTotalSupport) {
    throw new RangeError("p and q exceed the supported annular limits");
  }
  if (!Number.isFinite(throughProbability) || throughProbability < 0 || throughProbability > 1) {
    throw new RangeError("through probability must be in [0,1]");
  }
  const outer = randomBlocksInInterval(1, p, random);
  const inner = randomBlocksInInterval(p + 1, p + q, random);
  const blocks = boundedRandom(random) < throughProbability
    ? [[...(outer[0] ?? []), ...(inner[0] ?? [])], ...outer.slice(1), ...inner.slice(1)]
    : [...outer, ...inner];
  return blocks.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0)).map((block) => `(${block.join(" ")})`).join("");
}

/** Build a connected Mingo–Nica annular-noncrossing permutation with one rooted through-cycle. */
export function randomConnectedAnnularNoncrossingPermutation(
  p: number,
  q: number,
  random: RandomSource = Math.random,
  density: AnnularRandomDensity = "balanced",
): AnnularPermutation {
  if (!Number.isSafeInteger(p) || p < 1 || !Number.isSafeInteger(q) || q < 1 || p > INPUT_LIMITS.annularP || q > INPUT_LIMITS.annularQ || p + q > INPUT_LIMITS.annularTotalSupport) {
    throw new RangeError("p and q exceed the supported annular limits");
  }
  if (!Object.hasOwn(BLOCK_DENSITIES, density)) throw new RangeError("unknown annular random density");
  const profile = BLOCK_DENSITIES[density];
  const outer = randomBlocksInInterval(1, p, random, profile);
  const inner = randomBlocksInInterval(p + 1, p + q, random, profile);
  const blocks = [[...(outer[0] ?? []), ...(inner[0] ?? [])], ...outer.slice(1), ...inner.slice(1)];
  const notation = blocks.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0)).map((block) => `(${block.join(" ")})`).join("");
  const parsed = parseAnnularPermutation(notation, p, q);
  if (!parsed.ok) throw new Error(`Random annular permutation invariant failed: ${parsed.error.kind}`);
  const analysis = analyzeAnnularNoncrossing(parsed.value);
  if (!analysis.connected || !analysis.isNoncrossing) {
    throw new Error("Random annular permutation invariant failed: expected a connected annular-noncrossing permutation");
  }
  return parsed.value;
}

/** The least-complex connected ANC: one through-transposition and fixed points. */
export function minimalConnectedAnnularNoncrossingPermutation(p: number, q: number): AnnularPermutation {
  if (!Number.isSafeInteger(p) || p < 1 || !Number.isSafeInteger(q) || q < 1 || p > INPUT_LIMITS.annularP || q > INPUT_LIMITS.annularQ || p + q > INPUT_LIMITS.annularTotalSupport) {
    throw new RangeError("p and q exceed the supported annular limits");
  }
  const notation = `(1 ${p + 1})`;
  const parsed = parseAnnularPermutation(notation, p, q);
  if (!parsed.ok) throw new Error(`Minimal annular permutation invariant failed: ${parsed.error.kind}`);
  const analysis = analyzeAnnularNoncrossing(parsed.value);
  if (!analysis.connected || !analysis.isNoncrossing) throw new Error("Minimal annular permutation invariant failed");
  return parsed.value;
}
