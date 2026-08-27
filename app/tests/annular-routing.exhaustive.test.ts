import { describe, expect, it } from "vitest";
import { routeAnnularPermutation } from "../src/geometry/annular-routing";
import { annularPermutationFromImages, isAnnularNoncrossing } from "../src/math";
import { permutationImages } from "./helpers/permutations";

const EXPECTED_BOUNDED_REJECTIONS = new Map<string, readonly string[]>();

describe("release exhaustive annular routing", () => {
  it("strictly verifies every valid permutation routing outcome through total support five", () => {
    const table: Array<{ p: number; q: number; valid: number; routed: number; minimumClearance: number }> = [];
    for (let n = 2; n <= 5; n += 1) for (let p = 1; p < n; p += 1) {
      const q = n - p;
      let valid = 0; let routed = 0; let minimumClearance = Number.POSITIVE_INFINITY;
      const failures: string[] = [];
      for (const images of permutationImages(n)) {
        const created = annularPermutationFromImages(p, q, images);
        if (!created.ok) throw new Error(created.error.kind);
        if (!isAnnularNoncrossing(created.value)) continue;
        valid += 1;
        const result = routeAnnularPermutation(created.value);
        const expectedFailures = EXPECTED_BOUNDED_REJECTIONS.get(`${p},${q}`) ?? [];
        if (!result.isRoutable) {
          expect(result.diagnostics.searchNodes).toBeLessThanOrEqual(result.diagnostics.maxSearchNodes ?? 5_000);
          failures.push(`${images.join(",")}: ${result.reason}`);
          continue;
        }
        expect(expectedFailures.some((failure) => failure.startsWith(`${images.join(",")}:`)), `(${p},${q}) ${images.join(",")} unexpectedly changed from the explicit bounded-rejection contract`).toBe(false);
        expect(result.diagnostics.hardCollisionCount, `(${p},${q}) ${images.join(",")} reported a collision`).toBe(0);
        expect(result.diagnostics.minimumClearance, `(${p},${q}) ${images.join(",")} violated requested clearance`).toBeGreaterThanOrEqual(result.diagnostics.requestedHardClearance ?? 7.5);
        routed += 1;
        minimumClearance = Math.min(minimumClearance, result.diagnostics.minimumClearance);
      }
      table.push({ p, q, valid, routed, minimumClearance });
      const expectedFailures = EXPECTED_BOUNDED_REJECTIONS.get(`${p},${q}`) ?? [];
      expect(failures, `(${p},${q}) routing outcomes changed`).toEqual(expectedFailures);
      expect(routed).toBe(valid - expectedFailures.length);
    }
    console.info(`Exhaustive routing summary: ${JSON.stringify(table)}`);
  }, 1_800_000);
});
