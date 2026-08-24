import { describe, expect, it } from "vitest";
import {
  annularVertex,
  createAnnularLayout,
  createAnnularRoute,
  sampleAnnularRoute,
  type AnnularRoute,
  type Point,
} from "../src/geometry/annular";

const layout = createAnnularLayout(8, 5);
const TOLERANCE = 1e-7;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function radius(point: Point): number {
  return Math.hypot(point.x - layout.center.x, point.y - layout.center.y);
}

function expectPointClose(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
}

function expectContained(route: AnnularRoute): void {
  for (const point of sampleAnnularRoute(route, 161)) {
    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
    expect(radius(point)).toBeGreaterThanOrEqual(layout.innerRadius - TOLERANCE);
    expect(radius(point)).toBeLessThanOrEqual(layout.outerRadius + TOLERANCE);
  }
}

const routes = {
  outer: createAnnularRoute(layout, { startLabel: 1, endLabel: 3, excursion: 0.25, angularBias: 0.06 }),
  inner: createAnnularRoute(layout, { startLabel: 9, endLabel: 11, excursion: 0.28, angularBias: -0.05 }),
  through: createAnnularRoute(layout, { startLabel: 4, endLabel: 11, angularBias: 0.22 }),
  outerSingleton: createAnnularRoute(layout, { startLabel: 6, endLabel: 6, excursion: 0.11, angularBias: 0.18 }),
  innerSingleton: createAnnularRoute(layout, { startLabel: 12, endLabel: 12, excursion: 0.14, angularBias: -0.2 }),
} as const;

describe("annular route primitives", () => {
  it("assigns the required route taxonomy", () => {
    expect(routes.outer.kind).toBe("outer-outer");
    expect(routes.inner.kind).toBe("inner-inner");
    expect(routes.through.kind).toBe("through");
    expect(routes.outerSingleton.kind).toBe("outer-singleton");
    expect(routes.innerSingleton.kind).toBe("inner-singleton");
  });

  it.each(Object.entries(routes))("keeps %s samples in the annulus with exact endpoints", (_, route) => {
    expectContained(route);
    expectPointClose(route.pointAt(0), annularVertex(layout, route.startLabel).boundaryPoint);
    expectPointClose(route.pointAt(1), annularVertex(layout, route.endLabel).boundaryPoint);
  });

  it("moves outer routes inward and inner routes outward", () => {
    expect(radius(routes.outer.pointAt(0.5))).toBeLessThan(layout.outerRadius);
    expect(radius(routes.outer.pointAt(0.5))).toBeGreaterThan(layout.innerRadius);
    expect(radius(routes.inner.pointAt(0.5))).toBeGreaterThan(layout.innerRadius);
    expect(radius(routes.inner.pointAt(0.5))).toBeLessThan(layout.outerRadius);
  });

  it("moves through routes monotonically across cover height", () => {
    const outerInner = routes.through;
    const innerOuter = createAnnularRoute(layout, { startLabel: 11, endLabel: 4, angularBias: -0.22 });
    const parameters = Array.from({ length: 51 }, (_, index) => index / 50);
    const outward = parameters.map((t) => outerInner.coverPointAt(t).u);
    const inward = parameters.map((t) => innerOuter.coverPointAt(t).u);
    expect(outward.every((value, index) => index === 0 || value <= (outward[index - 1] as number))).toBe(true);
    expect(inward.every((value, index) => index === 0 || value >= (inward[index - 1] as number))).toBe(true);
  });

  it("creates restrained singleton loops with nonzero extent", () => {
    for (const route of [routes.outerSingleton, routes.innerSingleton]) {
      expectPointClose(route.pointAt(0), route.pointAt(1));
      expect(distance(route.pointAt(0), route.pointAt(0.5))).toBeGreaterThan(10);
    }
    expect(radius(routes.outerSingleton.pointAt(0.5))).toBeLessThan(layout.outerRadius);
    expect(radius(routes.innerSingleton.pointAt(0.5))).toBeGreaterThan(layout.innerRadius);
  });

  it("separates shallow/deep excursions and opposite angular biases", () => {
    const shallow = createAnnularRoute(layout, { startLabel: 1, endLabel: 3, excursion: 0.18 });
    const deep = createAnnularRoute(layout, { startLabel: 1, endLabel: 3, excursion: 0.48 });
    expect(distance(shallow.pointAt(0.5), deep.pointAt(0.5))).toBeGreaterThan(40);

    const positive = createAnnularRoute(layout, { startLabel: 4, endLabel: 11, angularBias: 0.22 });
    const negative = createAnnularRoute(layout, { startLabel: 4, endLabel: 11, angularBias: -0.22 });
    expectPointClose(positive.pointAt(0), negative.pointAt(0));
    expectPointClose(positive.pointAt(1), negative.pointAt(1));
    expect(distance(positive.pointAt(0.5), negative.pointAt(0.5))).toBeGreaterThan(50);
  });

  it("retains unwrapped winding while preserving physical endpoints", () => {
    const windingZero = createAnnularRoute(layout, { startLabel: 2, endLabel: 13, winding: 0, angularBias: 0.08 });
    const windingOne = createAnnularRoute(layout, { startLabel: 2, endLabel: 13, winding: 1, angularBias: 0.08 });
    expectPointClose(windingZero.pointAt(0), windingOne.pointAt(0));
    expectPointClose(windingZero.pointAt(1), windingOne.pointAt(1));
    expect(windingOne.angularDisplacement - windingZero.angularDisplacement).toBeCloseTo(2 * Math.PI, 12);
    expect(distance(windingZero.pointAt(0.5), windingOne.pointAt(0.5))).toBeGreaterThan(100);
  });

  it.each(Object.entries(routes))("has finite nonzero midpoint geometry for %s", (_, route) => {
    const point = route.pointAt(0.5);
    const tangent = route.tangentAt(0.5);
    expect([point.x, point.y, tangent.x, tangent.y].every(Number.isFinite)).toBe(true);
    expect(Math.hypot(tangent.x, tangent.y)).toBeGreaterThan(1e-6);
  });

  it("samples deterministically and includes exact endpoints", () => {
    const first = sampleAnnularRoute(routes.through, 80);
    const second = sampleAnnularRoute(routes.through, 80);
    expect(first).toEqual(second);
    expect(first).toHaveLength(80);
    expectPointClose(first[0] as Point, routes.through.pointAt(0));
    expectPointClose(first.at(-1) as Point, routes.through.pointAt(1));
    expect(() => sampleAnnularRoute(routes.through, 1)).toThrow(RangeError);
  });
});
