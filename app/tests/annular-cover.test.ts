import { describe, expect, it } from "vitest";
import {
  cartesianToCoverPoint,
  coverPointToCartesian,
  coverRadius,
  createAnnularLayout,
} from "../src/geometry/annular";

describe("logarithmic annular cover", () => {
  const layout = createAnnularLayout(5, 3);

  it("maps cover boundaries and intermediate heights logarithmically", () => {
    expect(coverRadius(layout, 0)).toBeCloseTo(layout.innerRadius, 12);
    expect(coverRadius(layout, 1)).toBeCloseTo(layout.outerRadius, 12);
    expect(coverRadius(layout, 0.5)).toBeCloseTo(Math.sqrt(layout.innerRadius * layout.outerRadius), 12);
  });

  it("is periodic under integer deck transformations", () => {
    const original = coverPointToCartesian(layout, { theta: 0.731, u: 0.42 });
    for (const winding of [-3, -1, 0, 1, 4]) {
      const shifted = coverPointToCartesian(layout, { theta: 0.731 + 2 * Math.PI * winding, u: 0.42 });
      expect(shifted.x).toBeCloseTo(original.x, 10);
      expect(shifted.y).toBeCloseTo(original.y, 10);
    }
  });

  it("round-trips physical points to the principal cover angle", () => {
    const cartesian = coverPointToCartesian(layout, { theta: -0.82, u: 0.67 });
    const lifted = cartesianToCoverPoint(layout, cartesian);
    expect(lifted.theta).toBeCloseTo(-0.82, 12);
    expect(lifted.u).toBeCloseTo(0.67, 12);
  });
});
