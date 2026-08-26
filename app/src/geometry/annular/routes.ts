import { coverPointToCartesian, coverRadius } from "./cover";
import { annularVertex } from "./layout";
import type {
  AnnularBoundary,
  AnnularLayout,
  AnnularRoute,
  AnnularRouteKind,
  AnnularRouteOptions,
  CoverPoint,
  Vector,
} from "./types";

const TWO_PI = 2 * Math.PI;
const DEFAULT_EXCURSION = 0.3;
const DEFAULT_SINGLETON_EXCURSION = 0.12;
const DEFAULT_SINGLETON_BIAS = 0.2;

export function smoothBump(t: number): number {
  return 16 * t * t * (1 - t) * (1 - t);
}

export function smoothBumpDerivative(t: number): number {
  return 32 * t * (1 - t) * (1 - 2 * t);
}

export function smoothStep(t: number): number {
  return 3 * t * t - 2 * t * t * t;
}

export function smoothStepDerivative(t: number): number {
  return 6 * t - 6 * t * t;
}

function requireParameter(t: number): void {
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new RangeError("route parameter must be in [0,1]");
}

function routeKind(start: AnnularBoundary, end: AnnularBoundary, singleton: boolean): AnnularRouteKind {
  if (singleton) return start === "outer" ? "outer-singleton" : "inner-singleton";
  if (start !== end) return "through";
  return start === "outer" ? "outer-outer" : "inner-inner";
}

function coverHeight(kind: AnnularRouteKind, start: AnnularBoundary, excursion: number, t: number): number {
  const bump = smoothBump(t);
  if (kind === "outer-outer" || kind === "outer-singleton") return 1 - excursion * bump;
  if (kind === "inner-inner" || kind === "inner-singleton") return excursion * bump;
  return start === "outer" ? 1 - smoothStep(t) : smoothStep(t);
}

function coverHeightDerivative(
  kind: AnnularRouteKind,
  start: AnnularBoundary,
  excursion: number,
  t: number,
): number {
  const bumpDerivative = smoothBumpDerivative(t);
  if (kind === "outer-outer" || kind === "outer-singleton") return -excursion * bumpDerivative;
  if (kind === "inner-inner" || kind === "inner-singleton") return excursion * bumpDerivative;
  return start === "outer" ? -smoothStepDerivative(t) : smoothStepDerivative(t);
}

export function createAnnularRoute(layout: AnnularLayout, options: AnnularRouteOptions): AnnularRoute {
  const start = annularVertex(layout, options.startLabel);
  const end = annularVertex(layout, options.endLabel);
  const singleton = start.label === end.label;
  const kind = routeKind(start.boundary, end.boundary, singleton);
  const winding = options.winding ?? 0;
  if (!Number.isInteger(winding)) throw new RangeError("winding must be an integer");
  if (singleton && winding !== 0) throw new RangeError("singleton loops require winding 0");

  const excursion = options.excursion ?? (singleton ? DEFAULT_SINGLETON_EXCURSION : DEFAULT_EXCURSION);
  if (!Number.isFinite(excursion) || excursion <= 0 || excursion >= 1) {
    throw new RangeError("excursion must be finite and in (0,1)");
  }
  const angularBias = options.angularBias ?? (singleton ? DEFAULT_SINGLETON_BIAS : 0);
  if (!Number.isFinite(angularBias)) throw new RangeError("angularBias must be finite");
  if (singleton && Math.abs(angularBias) < 1e-9) {
    throw new RangeError("singleton loops require nonzero angularBias");
  }

  const startLiftAngle = start.angle;
  const endLiftAngle = end.angle + TWO_PI * winding;
  const angularDisplacement = endLiftAngle - startLiftAngle;
  const logarithmicRadiusRatio = Math.log(layout.outerRadius / layout.innerRadius);
  const maximumHeightDerivative = kind === "through" ? 1.5 : excursion * 8;
  const maximumHeightSecondDerivative = kind === "through" ? 6 : excursion * 32;
  const maximumAngleDerivative = singleton
    ? Math.abs(angularBias) * TWO_PI
    : Math.abs(angularDisplacement) + Math.abs(angularBias) * 8;
  const maximumAngleSecondDerivative = singleton
    ? Math.abs(angularBias) * TWO_PI * TWO_PI
    : Math.abs(angularBias) * 32;
  const maximumRadialDerivativeFactor = logarithmicRadiusRatio * maximumHeightDerivative;
  const maximumSecondDerivative = layout.outerRadius * (
    maximumRadialDerivativeFactor * maximumRadialDerivativeFactor
    + logarithmicRadiusRatio * maximumHeightSecondDerivative
    + 2 * maximumRadialDerivativeFactor * maximumAngleDerivative
    + maximumAngleSecondDerivative
    + maximumAngleDerivative * maximumAngleDerivative
  );

  const angleAt = (t: number): number => {
    if (singleton) return startLiftAngle + angularBias * Math.sin(TWO_PI * t);
    return startLiftAngle + angularDisplacement * t + angularBias * smoothBump(t);
  };
  const angleDerivativeAt = (t: number): number => {
    if (singleton) return angularBias * TWO_PI * Math.cos(TWO_PI * t);
    return angularDisplacement + angularBias * smoothBumpDerivative(t);
  };

  const coverPointAt = (t: number): CoverPoint => {
    requireParameter(t);
    return Object.freeze({
      theta: angleAt(t),
      u: coverHeight(kind, start.boundary, excursion, t),
    });
  };
  const pointAt = (t: number) => coverPointToCartesian(layout, coverPointAt(t));
  const tangentAt = (t: number): Vector => {
    requireParameter(t);
    const coverPoint = coverPointAt(t);
    const radius = coverRadius(layout, coverPoint.u);
    const thetaDerivative = angleDerivativeAt(t);
    const uDerivative = coverHeightDerivative(kind, start.boundary, excursion, t);
    const radiusDerivative = radius * Math.log(layout.outerRadius / layout.innerRadius) * uDerivative;
    return Object.freeze({
      x: radiusDerivative * Math.cos(coverPoint.theta) - radius * Math.sin(coverPoint.theta) * thetaDerivative,
      y: radiusDerivative * Math.sin(coverPoint.theta) + radius * Math.cos(coverPoint.theta) * thetaDerivative,
    });
  };

  return Object.freeze({
    kind,
    startLabel: start.label,
    endLabel: end.label,
    startBoundary: start.boundary,
    endBoundary: end.boundary,
    winding,
    angularBias,
    excursion,
    startLiftAngle,
    endLiftAngle,
    angularDisplacement,
    maximumSecondDerivative,
    coverPointAt,
    pointAt,
    tangentAt,
  });
}
