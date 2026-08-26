import { describe, expect, it } from "vitest";
import { INPUT_LIMITS } from "../src/config/limits";
import { ROUTING_POLICY } from "../src/config/routingPolicy";
import { adaptiveRouteSamples, routeAnnularPermutation } from "../src/geometry/annular-routing";
import { createAnnularLayout, createAnnularRoute } from "../src/geometry/annular";
import { annularPermutationFromImages, parseAnnularPermutation, parseDiscPartition, partitionToString } from "../src/math";
import { processAnnularInput, resolveCanonicalAnnularBlocks } from "../src/production/annularController";

function annular(text: string, p: number, q: number) {
  const result = parseAnnularPermutation(text, p, q);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

describe("hostile input and supported boundaries", () => {
  it("round-trips a deterministic supported partition corpus", () => {
    for (const notation of ["(1)", "(1)(2)", "(1 4)(2 3)", "(1 2 3)(4)(5 6)"]) {
      const first = parseDiscPartition(notation);
      expect(first.ok).toBe(true);
      if (!first.ok) continue;
      const second = parseDiscPartition(partitionToString(first.value));
      expect(second).toEqual(first);
    }
  });

  it.each([
    "(4294967296)",
    "(999999999999999999999999999999999999999)",
    `(9007199254740991)`,
    `(9007199254740992)`,
    `(1e1000000)`,
    `(NaN)`,
    `(Infinity)`,
  ])("rejects disc token %s without throwing", (text) => {
    expect(() => parseDiscPartition(text)).not.toThrow();
    expect(parseDiscPartition(text).ok).toBe(false);
  });

  it("accepts the disc limit and rejects the next label structurally", () => {
    const atLimit = Array.from({ length: INPUT_LIMITS.discSupport }, (_, index) => `(${index + 1})`).join("");
    expect(parseDiscPartition(atLimit).ok).toBe(true);
    const above = parseDiscPartition(`(${INPUT_LIMITS.discSupport + 1})`);
    expect(above.ok).toBe(false);
    if (!above.ok) expect(above.error.kind).toBe("label-too-large");
  });

  it.each(["4294967295", "4294967296", "9007199254740991", "9007199254740992", "9".repeat(10_000)])("rejects annular boundary %s without throwing", (p) => {
    expect(() => processAnnularInput(p, "1", "")).not.toThrow();
    const result = processAnnularInput(p, "1", "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("input-limit");
  });

  it("enforces individual and total annular limits", () => {
    expect(processAnnularInput(String(INPUT_LIMITS.annularP), "1", "").ok).toBe(true);
    expect(processAnnularInput(String(INPUT_LIMITS.annularP + 1), "1", "").ok).toBe(false);
    expect(processAnnularInput("12", "12", "").ok).toBe(true);
    expect(processAnnularInput("13", "12", "").ok).toBe(false);
  });
});

describe("bounded auto-orientation", () => {
  it("finds a natural orientation for two entered crossing seven-element supports", () => {
    const entered = annular("(1 3 5 7 2 4 6)(8 10 12 14 9 11 13)", 7, 7);
    const result = resolveCanonicalAnnularBlocks(entered);
    expect(result.status).toBe("found");
    expect(result.searchedOrientationCandidates).toBeLessThanOrEqual(result.maxOrientationCandidates);
  });

  it("stops a factorial stress search at the global budget with truthful semantics", () => {
    const entered = annular("(1 3 5 7 2 4 6)(8 10 12 14 9 11 13)", 7, 7);
    const result = resolveCanonicalAnnularBlocks(entered, 1);
    expect(result.searchedOrientationCandidates).toBeLessThanOrEqual(1);
    expect(["found", "auto-orient-search-exhausted"]).toContain(result.status);
    expect(result.status).not.toBe("no-annular-noncrossing-orientation");
  });
});

describe("truthful routing contracts", () => {
  it("requires explicit reduced clearance for the former (1,4) coarse-sampling admission", () => {
    const created = annularPermutationFromImages(1, 4, [3, 2, 5, 4, 1]);
    if (!created.ok) throw new Error(created.error.kind);
    const routed = routeAnnularPermutation(created.value, { phaseCandidateCount: 2, maxCandidatesPerEdge: 20, maxSearchNodes: 1_000, hardClearance: 0.1 });
    expect(routed.isRoutable, `${routed.isRoutable ? "success" : routed.reason}: ${JSON.stringify(routed.diagnostics)}`).toBe(true);
    if (routed.isRoutable) {
      expect(routed.diagnostics.minimumClearance).toBeGreaterThanOrEqual(0.1);
      expect(routed.diagnostics.minimumClearance).toBeLessThan(7.5);
      expect(routed.diagnostics.requestedHardClearance).toBe(0.1);
    }
  }, 30_000);

  it("never weakens a requested hard clearance of 10", () => {
    const routed = routeAnnularPermutation(annular("(1 11)(2 3 16)(4 5 6)(7 13)(8)(9 12)(10)(14 15)(17)", 10, 7), { hardClearance: 10 });
    if (routed.isRoutable) expect(routed.diagnostics.minimumClearance).toBeGreaterThanOrEqual(10);
    else expect(["search-limit-exceeded", "no-route-within-routing-policy", "geometry-verification-failed"]).toContain(routed.reason);
  }, 20_000);

  it("keeps sampleCount=2 out of final collision truth for a (1,3) regression", () => {
    const routed = routeAnnularPermutation(annular("(1 3)(2 4)", 1, 3), { sampleCount: 2 });
    if (routed.isRoutable) {
      expect(routed.diagnostics.hardCollisionCount).toBe(0);
      expect(routed.diagnostics.minimumClearance).toBeGreaterThanOrEqual(routed.diagnostics.requestedHardClearance ?? ROUTING_POLICY.hardClearance);
      expect(routed.routes.every((route) => route.samples.length > 2)).toBe(true);
    } else expect(routed.reason).not.toBe("invalid-mathematical-input");
  });

  it("treats maxSearchNodes as one call-wide cap", () => {
    for (const maxSearchNodes of [0, 1]) {
      const routed = routeAnnularPermutation(annular("(1)(2)", 1, 1), { maxSearchNodes });
      expect(routed.diagnostics.searchNodes).toBeLessThanOrEqual(maxSearchNodes);
      expect(routed.diagnostics.maxSearchNodes).toBe(maxSearchNodes);
      if (!routed.isRoutable) {
        expect(routed.reason).toBe("search-limit-exceeded");
        expect(routed.diagnostics.principalSearchProof).toBe("not-proven");
      }
    }
  });

  it("adaptively subdivides high-curvature geometry within configured bounds", () => {
    const route = createAnnularRoute(createAnnularLayout(4, 2), { startLabel: 1, endLabel: 3, excursion: 0.7, angularBias: 1.1 });
    const verified = adaptiveRouteSamples(route);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.samples.length).toBeGreaterThan(2);
      expect(verified.samples.length - 1).toBeLessThanOrEqual(ROUTING_POLICY.verificationMaxSegmentsPerRoute);
    }
  });
});
