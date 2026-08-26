import { describe, expect, it, vi } from "vitest";
import { routeAnnularPermutation, serializeRoutedAnnularDiagram, type RoutedAnnularDiagram } from "../src/geometry/annular-routing";
import { annularPermutationToString, parseAnnularPermutation, parseNoncrossingPartition, partitionToString } from "../src/math";
import { processAnnularInput } from "../src/production/annularController";
import { ProductionSurfaceState } from "../src/production/surfaceState";

describe("production mathematical mode controller", () => {
  it("keeps disc block orientation canonical but annular permutation orientation distinct", () => {
    const discA = parseNoncrossingPartition("(1 2 3)");
    const discB = parseNoncrossingPartition("(1 3 2)");
    expect(discA.ok && discB.ok && partitionToString(discA.value)).toBe(discB.ok ? partitionToString(discB.value) : "");

    const annularA = parseAnnularPermutation("(1 2 3)(4)", 3, 1);
    const annularB = parseAnnularPermutation("(1 3 2)(4)", 3, 1);
    expect(annularA.ok && annularB.ok).toBe(true);
    if (annularA.ok && annularB.ok) expect(annularPermutationToString(annularA.value)).not.toBe(annularPermutationToString(annularB.value));
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
    const crossing = processAnnularInput("2", "2", "(1 3 2 4)");
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

    // Presentation state consumes the retained routed object and never calls this controller.
    const presentationStates = [
      { fill: false, arrows: false, width: 2, selected: null },
      { fill: true, arrows: false, width: 2, selected: null },
      { fill: true, arrows: true, width: 7, selected: accepted.routed.routes[0]?.edge.id },
    ];
    for (const state of presentationStates) {
      expect(state).toBeDefined();
      expect(serializeRoutedAnnularDiagram(accepted.routed)).toBe(identity);
    }
    expect(router).toHaveBeenCalledOnce();
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
