import { describe, expect, it, vi } from "vitest";
import { routeAnnularPermutation, serializeRoutedAnnularDiagram, type RoutedAnnularDiagram } from "../src/geometry/annular-routing";
import { annularPermutationToString, parseAnnularPermutation, parseNoncrossingPartition, partitionToString } from "../src/math";
import { annularResolutionMessage, processAnnularInput } from "../src/production/annularController";
import { canonicalizeAnnularBlocks } from "../src/production/annularController";
import { ProductionSurfaceState } from "../src/production/surfaceState";

describe("production mathematical mode controller", () => {
  it("keeps disc block orientation canonical but strict annular permutation orientation distinct", () => {
    const discA = parseNoncrossingPartition("(1 2 3)");
    const discB = parseNoncrossingPartition("(1 3 2)");
    expect(discA.ok && discB.ok && partitionToString(discA.value)).toBe(discB.ok ? partitionToString(discB.value) : "");

    const annularA = parseAnnularPermutation("(1 2 3)(4)", 3, 1);
    const annularB = parseAnnularPermutation("(1 3 2)(4)", 3, 1);
    expect(annularA.ok && annularB.ok).toBe(true);
    if (annularA.ok && annularB.ok) expect(annularPermutationToString(annularA.value)).not.toBe(annularPermutationToString(annularB.value));

    const strictA = processAnnularInput("3", "1", "(1 2 3)(4)");
    const strictB = processAnnularInput("3", "1", "(1 3 2)(4)");
    expect(strictA.ok).toBe(true);
    expect(strictB.ok).toBe(false);
    if (strictA.ok) {
      expect(strictA.interpretation).toBe("strict-permutation");
      expect(strictA.sourceNotation).toBe("(1 2 3)(4)");
      expect(strictA.resolvedNotation).toBe("(1 2 3)(4)");
      expect(strictA.wasAutoOriented).toBe(false);
    }
  });

  it("classifies boundary, syntax, domain, crossing, and router failures separately", () => {
    for (const [p, q] of [["", "2"], ["0", "2"], ["-1", "2"], ["1.5", "2"]] as const) {
      const result = processAnnularInput(p, q, "(1)(2)");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("syntax-domain");
    }
    const malformed = processAnnularInput("2", "2", "(1, 2)");
    expect(!malformed.ok && malformed.error.kind).toBe("syntax-domain");
    const range = processAnnularInput("2", "2", "(1 5)");
    expect(!range.ok && range.error.message).toBe("Label 5 exceeds p+q=4.");
    const crossing = processAnnularInput("4", "1", "(1 3)(2 4)(5)");
    expect(!crossing.ok && crossing.error.kind).toBe("mathematically-crossing");

    const router = vi.fn((value): RoutedAnnularDiagram => {
      const admitted = routeAnnularPermutation(value);
      return { isRoutable: false, permutation: value, reason: "search-limit-exceeded", diagnostics: admitted.diagnostics };
    });
    const failed = processAnnularInput("1", "1", "(1 2)", router);
    expect(router).toHaveBeenCalledOnce();
    expect(!failed.ok && failed.error.kind).toBe("router-failure");
    expect(!failed.ok && failed.error.message).toContain("mathematically annular-noncrossing");
    expect(!failed.ok && failed.error.message).toContain("search budget was exhausted");

    const thrown = processAnnularInput("1", "1", "(1 2)", () => { throw new Error("boom"); });
    expect(!thrown.ok && thrown.error.kind).toBe("router-failure");
    expect(!thrown.ok && thrown.error.message).toContain("unexpected failure");
  });

  it("routes only when mathematical input is accepted and remains deterministic", () => {
    const router = vi.fn(routeAnnularPermutation);
    const accepted = processAnnularInput("3", "2", "(1 4)(2)(3)(5)", router);
    expect(accepted.ok).toBe(true);
    expect(router).toHaveBeenCalledOnce();
    if (!accepted.ok) return;
    const identity = serializeRoutedAnnularDiagram(accepted.routed);

    const disc = parseNoncrossingPartition("(1)(2)");
    if (!disc.ok) throw new Error(disc.error.kind);
    const presentation = new ProductionSurfaceState(disc.value, accepted);
    presentation.switchTo("annular");
    presentation.switchTo("disc");
    presentation.switchTo("annular");
    expect(serializeRoutedAnnularDiagram(presentation.annular.routed)).toBe(identity);
    expect(router).toHaveBeenCalledOnce();
  });

  it("resolves equal block supports to one explicit canonical orientation", () => {
    const a = processAnnularInput("4", "2", "(1 3 4)(2)(5)(6)", routeAnnularPermutation, "canonical-blocks");
    const b = processAnnularInput("4", "2", "(1 4 3)(2)(5)(6)", routeAnnularPermutation, "canonical-blocks");
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.resolvedNotation).toBe(b.resolvedNotation);
      expect(b.sourceNotation).toBe("(1 4 3)(2)(5)(6)");
      expect(b.wasAutoOriented).toBe(true);
      expect(b.interpretation).toBe("canonical-blocks");
      expect(annularResolutionMessage(b)).toBe(`Auto-oriented block supports to τ = ${b.resolvedNotation}`);
    }
  });

  it("canonicalizes the reported (8,5) block set", () => {
    const parsed = parseAnnularPermutation("(1 2 3)(4 6)(5)(7 8 9 12 13)(10 11)", 8, 5);
    if (!parsed.ok) throw new Error(parsed.error.kind);
    const canonical = canonicalizeAnnularBlocks(parsed.value);
    expect(canonical && annularPermutationToString(canonical)).toMatchInlineSnapshot(`"(1 2 3)(4 6)(5)(7 8 9 12 13)(10 11)"`);
  });

  it("restores the last valid mathematical object when modes switch", () => {
    const disc = parseNoncrossingPartition("(1 4)(2 3)");
    const annular = processAnnularInput("3", "2", "(1 4)(2)(3)(5)");
    if (!disc.ok || !annular.ok) throw new Error("Invalid state fixture");
    const state = new ProductionSurfaceState(disc.value, annular);
    const discIdentity = state.discPartition;
    const annularIdentity = state.annular;
    state.switchTo("annular");
    expect(state.annular).toBe(annularIdentity);
    state.switchTo("disc");
    expect(state.discPartition).toBe(discIdentity);
    state.switchTo("annular");
    expect(state.annular).toBe(annularIdentity);
  });
});
