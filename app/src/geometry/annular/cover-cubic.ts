import { coverPointToCartesian, coverRadius } from "./cover";
import { annularVertex } from "./layout";
import type { AnnularLayout, AnnularRoute, AnnularRouteKind, CoverPoint, Vector } from "./types";

export interface CoverCubicControlPoint extends CoverPoint {}

export interface CoverCubicRouteOptions {
  readonly startLabel: number;
  readonly endLabel: number;
  readonly startLiftAngle: number;
  readonly endLiftAngle: number;
  readonly control1: CoverCubicControlPoint;
  readonly control2: CoverCubicControlPoint;
}

export interface CoverCubicAnnularRoute extends AnnularRoute {
  readonly family: "cover-cubic";
  readonly controlPoints: readonly [CoverCubicControlPoint, CoverCubicControlPoint, CoverCubicControlPoint, CoverCubicControlPoint];
}

const TWO_PI = 2 * Math.PI;

function requireParameter(t: number): void {
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new RangeError("route parameter must be in [0,1]");
}

function requireCoverPoint(point: CoverCubicControlPoint, name: string): void {
  if (!Number.isFinite(point.theta) || !Number.isFinite(point.u) || point.u < 0 || point.u > 1) {
    throw new RangeError(`${name} must have finite theta and u in [0,1]`);
  }
}

function kind(start: "outer" | "inner", end: "outer" | "inner"): AnnularRouteKind {
  if (start !== end) return "through";
  return start === "outer" ? "outer-outer" : "inner-inner";
}

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const s = 1 - t;
  return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d;
}

function cubicDerivative(a: number, b: number, c: number, d: number, t: number): number {
  const s = 1 - t;
  return 3 * s * s * (b - a) + 6 * s * t * (c - b) + 3 * t * t * (d - c);
}

export function createCoverCubicAnnularRoute(
  layout: AnnularLayout,
  options: CoverCubicRouteOptions,
): CoverCubicAnnularRoute {
  const start = annularVertex(layout, options.startLabel);
  const end = annularVertex(layout, options.endLabel);
  if (start.label === end.label) throw new RangeError("cover cubics do not represent singleton loops");
  requireCoverPoint(options.control1, "control1");
  requireCoverPoint(options.control2, "control2");
  if (!Number.isFinite(options.startLiftAngle) || !Number.isFinite(options.endLiftAngle)) {
    throw new RangeError("lift angles must be finite");
  }
  const startPoint = Object.freeze({ theta: options.startLiftAngle, u: start.boundary === "outer" ? 1 : 0 });
  const endPoint = Object.freeze({ theta: options.endLiftAngle, u: end.boundary === "outer" ? 1 : 0 });
  const controls = Object.freeze([startPoint, Object.freeze(options.control1), Object.freeze(options.control2), endPoint] as const);
  const coverPointAt = (t: number): CoverPoint => {
    requireParameter(t);
    return Object.freeze({
      theta: cubic(controls[0].theta, controls[1].theta, controls[2].theta, controls[3].theta, t),
      u: cubic(controls[0].u, controls[1].u, controls[2].u, controls[3].u, t),
    });
  };
  const pointAt = (t: number) => coverPointToCartesian(layout, coverPointAt(t));
  const tangentAt = (t: number): Vector => {
    requireParameter(t);
    const point = coverPointAt(t);
    const thetaDerivative = cubicDerivative(controls[0].theta, controls[1].theta, controls[2].theta, controls[3].theta, t);
    const uDerivative = cubicDerivative(controls[0].u, controls[1].u, controls[2].u, controls[3].u, t);
    const radius = coverRadius(layout, point.u);
    const radiusDerivative = radius * Math.log(layout.outerRadius / layout.innerRadius) * uDerivative;
    return Object.freeze({
      x: radiusDerivative * Math.cos(point.theta) - radius * Math.sin(point.theta) * thetaDerivative,
      y: radiusDerivative * Math.sin(point.theta) + radius * Math.cos(point.theta) * thetaDerivative,
    });
  };
  const rawWinding = (options.endLiftAngle - end.angle) / TWO_PI;
  const winding = Math.round(rawWinding);
  if (Math.abs(rawWinding - winding) > 1e-7 || Math.abs(options.startLiftAngle - start.angle) > 1e-7) {
    throw new RangeError("cover cubic lift angles must be canonical start plus an integral end deck shift");
  }
  return Object.freeze({
    family: "cover-cubic",
    controlPoints: controls,
    kind: kind(start.boundary, end.boundary),
    startLabel: start.label,
    endLabel: end.label,
    startBoundary: start.boundary,
    endBoundary: end.boundary,
    winding,
    angularBias: ((options.control1.theta + options.control2.theta) - (startPoint.theta + endPoint.theta)) / 2,
    excursion: start.boundary === end.boundary
      ? Math.max(Math.abs(options.control1.u - startPoint.u), Math.abs(options.control2.u - startPoint.u))
      : 0,
    startLiftAngle: startPoint.theta,
    endLiftAngle: endPoint.theta,
    angularDisplacement: endPoint.theta - startPoint.theta,
    coverPointAt,
    pointAt,
    tangentAt,
  });
}

