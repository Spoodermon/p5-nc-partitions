import { describe, expect, it } from "vitest";
import { isEditableCoverCubic, routeAnnularPermutation, routePolylineHasSelfContact, verifyAnnularRouteControlEdit } from "../src/geometry/annular-routing";
import { parseAnnularPermutation } from "../src/math";

function routedFixture() {
  const parsed = parseAnnularPermutation("(1 4)(2)(3)(5)", 3, 2);
  if (!parsed.ok) throw new Error(parsed.error.kind);
  const routed = routeAnnularPermutation(parsed.value);
  if (!routed.isRoutable) throw new Error(routed.reason);
  return routed;
}

function singletonRoute(boundary: "outer" | "inner") {
  const routed = routedFixture();
  const candidate = routed.routes.find((route) => route.edge.role === "singleton" && route.edge.startBoundary === boundary);
  if (!isEditableCoverCubic(candidate)) throw new Error(`missing editable ${boundary} singleton route`);
  return { routed, candidate };
}

describe("annular cover-cubic editing", () => {
  it("preserves anchors and winding and admits a verified small control move", () => {
    const routed = routedFixture();
    const candidate = routed.routes.find(isEditableCoverCubic);
    if (!candidate) throw new Error("missing editable route");
    const [start, control1, control2, end] = candidate.route.controlPoints;
    const edited = verifyAnnularRouteControlEdit(routed, candidate.edge.id, {
      control1: { theta: control1.theta + 0.004, u: control1.u },
      control2,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const changed = edited.routed.routes.find((route) => route.edge.id === candidate.edge.id);
    expect(isEditableCoverCubic(changed)).toBe(true);
    if (!isEditableCoverCubic(changed)) return;
    expect(changed.route.controlPoints[0]).toEqual(start);
    expect(changed.route.controlPoints[3]).toEqual(end);
    expect(changed.winding).toBe(candidate.winding);
    expect(edited.routed.diagnostics.hardCollisionCount).toBe(0);
    expect(routed.routes.find((route) => route.edge.id === candidate.edge.id)?.route).toBe(candidate.route);
  });

  it.each(["outer", "inner"] as const)("edits an %s singleton while keeping its coincident anchor pinned and winding zero", (boundary) => {
    const { routed, candidate } = singletonRoute(boundary);
    const [start, control1, control2, end] = candidate.route.controlPoints;
    expect(start).toEqual(end);
    expect(candidate.winding).toBe(0);

    const edited = verifyAnnularRouteControlEdit(routed, candidate.edge.id, {
      control1: { theta: control1.theta + 0.002, u: control1.u },
      control2,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const changed = edited.routed.routes.find((route) => route.edge.id === candidate.edge.id);
    expect(isEditableCoverCubic(changed)).toBe(true);
    if (!isEditableCoverCubic(changed)) return;
    expect(changed.route.controlPoints[0]).toEqual(start);
    expect(changed.route.controlPoints[3]).toEqual(end);
    expect(changed.route.controlPoints[0]).toEqual(changed.route.controlPoints[3]);
    expect(changed.winding).toBe(0);
    expect(edited.routed.diagnostics.hardCollisionCount).toBe(0);
    expect(routed.routes.find((route) => route.edge.id === candidate.edge.id)?.route).toBe(candidate.route);
  });

  it("rejects collapsed and folded singleton controls without mutating the admitted route", () => {
    const { routed, candidate } = singletonRoute("outer");
    const [anchor, control1] = candidate.route.controlPoints;
    const before = candidate.route;
    const collapsed = verifyAnnularRouteControlEdit(routed, candidate.edge.id, {
      control1: anchor,
      control2: anchor,
    });
    expect(collapsed).toEqual({ ok: false, reason: "self-intersection" });

    // Equal non-anchor handles make the closed cubic retrace the same branch
    // on its return to the pinned singleton vertex.
    const folded = verifyAnnularRouteControlEdit(routed, candidate.edge.id, {
      control1,
      control2: control1,
    });
    expect(folded).toEqual({ ok: false, reason: "self-intersection" });
    expect(routed.routes.find((route) => route.edge.id === candidate.edge.id)?.route).toBe(before);
  });

  it("rejects a control move onto another edge without mutating the prior state", () => {
    const routed = routedFixture();
    const candidate = routed.routes.find(isEditableCoverCubic);
    const obstacle = routed.routes.find((route) => route.edge.id !== candidate?.edge.id && route.edge.cycleIndex === candidate?.edge.cycleIndex);
    if (!candidate || !obstacle) throw new Error("missing edit collision fixture");
    const collisionPoint = obstacle.route.coverPointAt(0.5);
    const [start, , , end] = candidate.route.controlPoints;
    const reference = (start.theta + end.theta) / 2;
    const lifted = collisionPoint.theta + Math.round((reference - collisionPoint.theta) / (2 * Math.PI)) * 2 * Math.PI;
    // A cubic midpoint is (P0 + 3P1 + 3P2 + P3)/8. Equal controls
    // chosen this way force the edited route through the obstacle midpoint.
    const forcedControl = {
      theta: (8 * lifted - start.theta - end.theta) / 6,
      u: (8 * collisionPoint.u - start.u - end.u) / 6,
    };
    const before = candidate.route;
    const edited = verifyAnnularRouteControlEdit(routed, candidate.edge.id, {
      control1: forcedControl,
      control2: forcedControl,
    });
    expect(edited.ok).toBe(false);
    expect(routed.routes.find((route) => route.edge.id === candidate.edge.id)?.route).toBe(before);
  });

  it("fails closed for non-finite controls", () => {
    const routed = routedFixture();
    const candidate = routed.routes.find(isEditableCoverCubic);
    if (!candidate) throw new Error("missing editable route");
    const result = verifyAnnularRouteControlEdit(routed, candidate.edge.id, {
      control1: { theta: Number.NaN, u: 0.5 },
      control2: candidate.route.controlPoints[2],
    });
    expect(result).toEqual({ ok: false, reason: "invalid-controls" });
  });

  it("detects a compact self-crossing between segments i and i+2", () => {
    expect(routePolylineHasSelfContact([
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 2, y: 0 },
    ], 0)).toBe(true);
    expect(routePolylineHasSelfContact([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0.2 },
      { x: 3, y: 0.5 },
    ], 0)).toBe(false);
  });

  it("allows only the legitimate cyclic anchor contact of a closed singleton polyline", () => {
    expect(routePolylineHasSelfContact([
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 4, y: 0 },
      { x: 2, y: -2 },
      { x: 0, y: 0 },
    ], 0, true)).toBe(false);
    expect(routePolylineHasSelfContact([
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 2, y: 0 },
      { x: 0, y: 0 },
    ], 0, true)).toBe(true);
  });
});
