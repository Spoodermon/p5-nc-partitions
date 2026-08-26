import { describe, expect, it } from "vitest";
import { routeAnnularPermutation } from "../src/geometry/annular-routing";
import { annularPermutationFromImages, isAnnularNoncrossing } from "../src/math";
import { permutationImages } from "./helpers/permutations";

describe("release exhaustive annular routing", () => {
  it("strictly verifies every valid permutation routing outcome through total support five", () => {
    const table: Array<{ p: number; q: number; valid: number; routed: number; rejected: number; minimumClearance: number }> = [];
    for (let n = 2; n <= 5; n += 1) for (let p = 1; p < n; p += 1) {
      const q = n - p;
      let valid = 0; let routed = 0; let rejected = 0; let minimumClearance = Number.POSITIVE_INFINITY;
      const failures: string[] = [];
      for (const images of permutationImages(n)) {
        const created = annularPermutationFromImages(p, q, images);
        if (!created.ok) throw new Error(created.error.kind);
        if (!isAnnularNoncrossing(created.value)) continue;
        valid += 1;
        let result = routeAnnularPermutation(created.value, { phaseCandidateCount: 2, sampleCount: 25, maxCandidatesPerEdge: 140, maxSearchNodes: 2_000 });
        if (!result.isRoutable) result = routeAnnularPermutation(created.value, { maxSearchNodes: 2_000 });
        if (result.isRoutable && result.diagnostics.hardCollisionCount === 0) {
          routed += 1; minimumClearance = Math.min(minimumClearance, result.diagnostics.minimumClearance);
        } else {
          rejected += 1;
          if (!result.isRoutable) {
            expect(["search-limit-exceeded", "no-route-within-routing-policy", "geometry-verification-failed"]).toContain(result.reason);
            expect(result.diagnostics.searchNodes).toBeLessThanOrEqual(result.diagnostics.maxSearchNodes ?? 2_000);
          }
          failures.push(images.join(","));
        }
      }
      table.push({ p, q, valid, routed, rejected, minimumClearance });
      expect(routed + rejected, `(${p},${q}) unclassified: ${failures.join("; ")}`).toBe(valid);
    }
    console.info(`Exhaustive routing summary: ${JSON.stringify(table)}`);
  }, 1_800_000);
});
