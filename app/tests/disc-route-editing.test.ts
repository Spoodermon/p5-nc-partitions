import { describe, expect, it } from "vitest";
import { DISC_CENTER, DISC_RADIUS, sampleDiscArc, type Point } from "../src/geometry/disc";
import {
  createDiscGeometryState,
  isVerifiedDiscGeometryState,
  verifyDiscRouteControlEdit,
  type DiscGeometryState,
} from "../src/geometry/disc-editing";
import { parseDiscPartition } from "../src/math/parser";
import { randomNoncrossingPartition } from "../src/math";
import { partitionDiagram } from "../src/renderer/model";

function routed(notation: string): DiscGeometryState {
  const parsed = parseDiscPartition(notation);
  if (!parsed.ok) throw new Error(parsed.error.kind);
  return createDiscGeometryState(partitionDiagram(parsed.value));
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function properIntersection(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (start: Point, end: Point, point: Point) => (
    (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x)
  );
  return cross(a, b, c) * cross(a, b, d) < -1e-8
    && cross(c, d, a) * cross(c, d, b) < -1e-8;
}

describe("verified disc cubic editing", () => {
  it("admits a small edge adjustment while pinning both anchors and preserving the prior state", () => {
    const state = routed("(1 4)(2 3)(5)(6)");
    const current = state.routes.find((route) => route.edge.start === 1 && route.edge.end === 4);
    if (!current) throw new Error("Missing editable route");
    const result = verifyDiscRouteControlEdit(state, current.edge.id, {
      control1: { x: current.geometry.control1.x + 1, y: current.geometry.control1.y },
      control2: current.geometry.control2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const edited = result.state.routes.find((route) => route.edge.id === current.edge.id);
    expect(edited?.geometry.path).not.toBe(current.geometry.path);
    expect(edited?.samples[0]).toEqual({ x: current.start.x, y: current.start.y });
    expect(edited?.samples.at(-1)).toEqual({ x: current.end.x, y: current.end.y });
    expect(state.routes.find((route) => route.edge.id === current.edge.id)?.geometry.path).toBe(current.geometry.path);
    expect(result.state.manualEditCount).toBe(1);
  });

  it("rejects nonfinite and exterior controls without changing the admitted state", () => {
    const state = routed("(1 2 3)(4)");
    const current = state.routes[0];
    if (!current) throw new Error("Missing editable route");
    const nonfinite = verifyDiscRouteControlEdit(state, current.edge.id, {
      control1: { x: Number.NaN, y: 0 }, control2: current.geometry.control2,
    });
    const exterior = verifyDiscRouteControlEdit(state, current.edge.id, {
      control1: { x: DISC_CENTER.x + DISC_RADIUS + 1, y: DISC_CENTER.y }, control2: current.geometry.control2,
    });
    expect(nonfinite).toEqual({ ok: false, reason: "invalid-controls" });
    expect(exterior).toEqual({ ok: false, reason: "invalid-controls" });
    expect(state.manualEditCount).toBe(0);
    expect(state.routes[0]).toBe(current);
  });

  it("rejects a forced collision with another block and returns the exact prior state", () => {
    const state = routed("(1 4)(2 3)");
    const current = state.routes.find((route) => route.edge.start === 1 && route.edge.end === 4);
    const obstacle = state.routes.find((route) => route.edge.start === 2 && route.edge.end === 3);
    if (!current || !obstacle) throw new Error("Missing collision fixture routes");
    const target = obstacle.samples[Math.floor(obstacle.samples.length / 2)];
    if (!target) throw new Error("Missing collision target");
    const forced = { x: target.x, y: target.y };
    const result = verifyDiscRouteControlEdit(state, current.edge.id, { control1: forced, control2: forced });
    expect(result).toEqual({ ok: false, reason: "collision" });
    expect(state.routes.find((route) => route.edge.id === current.edge.id)).toBe(current);
  });

  it("supports genuine singleton cubics and rejects their collapse", () => {
    const state = routed("(1)(2)(3)(4)");
    const current = state.routes.find((route) => route.edge.role === "singleton");
    if (!current) throw new Error("Missing singleton route");
    const accepted = verifyDiscRouteControlEdit(state, current.edge.id, {
      control1: { x: current.geometry.control1.x, y: current.geometry.control1.y + 1 },
      control2: current.geometry.control2,
    });
    expect(accepted.ok).toBe(true);

    const collapsed = verifyDiscRouteControlEdit(state, current.edge.id, {
      control1: DISC_CENTER,
      control2: DISC_CENTER,
    });
    expect(collapsed).toEqual({ ok: false, reason: "self-intersection" });
  });

  it("does not allow a two-cycle edit to collapse onto its opposite lane", () => {
    const state = routed("(1 2)");
    const forward = state.routes.find((route) => route.edge.role === "forward");
    const reverse = state.routes.find((route) => route.edge.role === "return");
    if (!forward || !reverse) throw new Error("Missing two-cycle lanes");
    const result = verifyDiscRouteControlEdit(state, forward.edge.id, {
      control1: reverse.geometry.control2,
      control2: reverse.geometry.control1,
    });
    expect(result).toEqual({ ok: false, reason: "collision" });
  });

  it("keeps verification work bounded at the supported disc maximum", () => {
    const cycles = Object.freeze([
      Object.freeze([1, 2]),
      ...Array.from({ length: 398 }, (_, index) => Object.freeze([index + 3])),
    ]);
    const creationStarted = performance.now();
    const state = createDiscGeometryState(Object.freeze({ notation: "n=400 fixture", vertexCount: 400, cycles }));
    expect(performance.now() - creationStarted).toBeLessThan(1_000);
    expect(isVerifiedDiscGeometryState(state)).toBe(true);
    const current = state.routes[0];
    if (!current) throw new Error("Missing maximum-support route");
    const started = performance.now();
    verifyDiscRouteControlEdit(state, current.edge.id, {
      control1: { x: current.geometry.control1.x + 0.25, y: current.geometry.control1.y },
      control2: current.geometry.control2,
    });
    expect(performance.now() - started).toBeLessThan(1_000);

    const nestedPairs = Object.freeze(Array.from({ length: 200 }, (_, index) => (
      Object.freeze([index + 1, 400 - index])
    )));
    const nestedStarted = performance.now();
    const nestedState = createDiscGeometryState(Object.freeze({
      notation: "n=400 nested pairs",
      vertexCount: 400,
      cycles: nestedPairs,
    }));
    expect(performance.now() - nestedStarted).toBeLessThan(1_500);
    expect(isVerifiedDiscGeometryState(nestedState)).toBe(true);
  });

  it("keeps ordinary loops and two-cycle lanes visible across the former 64-edge cutoff", () => {
    for (const n of [64, 66]) {
      const pairs = routed(Array.from({ length: n / 2 }, (_, index) => `(${index * 2 + 1} ${index * 2 + 2})`).join(""));
      expect(pairs.compactPresentation).not.toBe(true);
      const [first, second] = pairs.routes;
      if (!first || !second) throw new Error("Missing paired routes");
      const a = sampleDiscArc(first.start, first.end, first.geometry, 3)[1]!;
      const b = sampleDiscArc(second.start, second.end, second.geometry, 3)[1]!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(4);
    }
    const singletons = routed(Array.from({ length: 65 }, (_, index) => `(${index + 1})`).join(""));
    expect(singletons.compactPresentation).not.toBe(true);
    const first = singletons.routes[0]!;
    const ys = first.samples.map((point) => point.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(20);
  });

  it("backs broad styling off until adversarial ordinary partitions have a certified whole layout", () => {
    for (const notation of [
      "(1 4)(2 3)(5 6 7 9 10)(8)",
      "(1 2 3 5 8)(4)(6)(7)(9 10 12)(11)",
      "(1 2 5)(3)(4)(6 8)(7)(9 10 11)(12)",
      "(1 9 15 16)(2 8)(3)(4 5 6)(7)(10 11 13)(12)(14)",
    ]) {
      const state = routed(notation);
      expect(isVerifiedDiscGeometryState(state), notation).toBe(true);
    }
  });

  it("keeps the whole state certified after editing an unrelated singleton in the former baseline-crossing fixture", () => {
    const state = routed("(1 4)(2 3)(5 6 7 9 10)(8)");
    const singleton = state.routes.find((route) => route.edge.role === "singleton");
    if (!singleton) throw new Error("Missing singleton route");
    const result = verifyDiscRouteControlEdit(state, singleton.edge.id, {
      control1: { x: singleton.geometry.control1.x + 1, y: singleton.geometry.control1.y },
      control2: singleton.geometry.control2,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(isVerifiedDiscGeometryState(result.state)).toBe(true);
  });

  it("rejects the former proper crossing hidden inside a shared-anchor clearance disk", () => {
    const state = routed("(1 4 5 6 7 18 20 21 22 24 27 29)(2)(3)(8 9 15 16 17)(10 11 13 14)(12)(19)(23)(25)(26)(28)");
    const first = state.routes.find((route) => route.edge.id === "cycle-4-edge-2");
    const second = state.routes.find((route) => route.edge.id === "cycle-4-edge-3");
    if (!first || !second) throw new Error("Missing shared-anchor regression routes");
    const firstSamples = sampleDiscArc(first.start, first.end, first.geometry, 513);
    const secondSamples = sampleDiscArc(second.start, second.end, second.geometry, 513);
    let intersects = false;
    for (let a = 0; a < firstSamples.length - 1 && !intersects; a += 1) {
      for (let b = 0; b < secondSamples.length - 1; b += 1) {
        if (properIntersection(firstSamples[a]!, firstSamples[a + 1]!, secondSamples[b]!, secondSamples[b + 1]!)) {
          intersects = true;
          break;
        }
      }
    }
    expect(intersects).toBe(false);
  });

  it("rejects sub-stroke near contacts", () => {
    const nearState = routed("(1 4)(2 3)(5)(6)");
    const nearRoute = nearState.routes.find((route) => route.edge.start === 1 && route.edge.end === 4);
    if (!nearRoute) throw new Error("Missing near-contact route");
    expect(verifyDiscRouteControlEdit(nearState, nearRoute.edge.id, {
      control1: { x: 745.3526587464111, y: 463.5032 },
      control2: { x: 745.3526587464111, y: 536.4968 },
    })).toEqual({ ok: false, reason: "collision" });
  });

  it("rejects forged structural states and treats exact controls as an identity operation", () => {
    const state = routed("(1 2 3)(4)");
    const route = state.routes[0];
    if (!route) throw new Error("Missing route");
    const identity = verifyDiscRouteControlEdit(state, route.edge.id, {
      control1: route.geometry.control1,
      control2: route.geometry.control2,
    });
    expect(identity).toEqual({ ok: true, state });

    const forged = { ...state } as DiscGeometryState;
    expect(verifyDiscRouteControlEdit(forged, route.edge.id, {
      control1: route.geometry.control1,
      control2: route.geometry.control2,
    })).toEqual({ ok: false, reason: "verification-failed" });
  });

  it("constructs a certified state for deterministic random noncrossing partitions across the supported range", () => {
    let checked = 0;
    for (const vertexCount of [1, 2, 8, 10, 12, 20, 50, 100, 200, 400]) {
      for (let trial = 0; trial < 5; trial += 1) {
        const partition = randomNoncrossingPartition(vertexCount, seeded(vertexCount * 101 + trial));
        const diagram = partitionDiagram(partition);
        let state: DiscGeometryState;
        try { state = createDiscGeometryState(diagram); }
        catch (error) { throw new Error(`n=${vertexCount}, trial=${trial}, ${diagram.notation}: ${String(error)}`); }
        expect(isVerifiedDiscGeometryState(state), `n=${vertexCount}, trial=${trial}`).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBe(50);
  }, 20_000);
});
