export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Vector {
  readonly x: number;
  readonly y: number;
}

export type AnnularBoundary = "outer" | "inner";

export interface AnnularVertex {
  readonly label: number;
  readonly boundary: AnnularBoundary;
  readonly angle: number;
  readonly boundaryPoint: Point;
  readonly labelPoint: Point;
}

export interface AnnularLayout {
  readonly p: number;
  readonly q: number;
  readonly center: Point;
  readonly outerRadius: number;
  readonly innerRadius: number;
  readonly innerPhase: number;
  readonly vertices: readonly AnnularVertex[];
}

export interface CoverPoint {
  readonly theta: number;
  readonly u: number;
}

export type AnnularRouteKind =
  | "outer-outer"
  | "inner-inner"
  | "through"
  | "outer-singleton"
  | "inner-singleton";

export interface AnnularRouteOptions {
  readonly startLabel: number;
  readonly endLabel: number;
  readonly winding?: number;
  readonly excursion?: number;
  readonly angularBias?: number;
}

export interface AnnularRoute {
  readonly kind: AnnularRouteKind;
  readonly startLabel: number;
  readonly endLabel: number;
  readonly startBoundary: AnnularBoundary;
  readonly endBoundary: AnnularBoundary;
  readonly winding: number;
  readonly angularBias: number;
  readonly excursion: number;
  readonly startLiftAngle: number;
  readonly endLiftAngle: number;
  readonly angularDisplacement: number;
  /** Global bound on |d²(pointAt(t))/dt²| for t in [0,1]. */
  readonly maximumSecondDerivative: number;
  readonly coverPointAt: (t: number) => CoverPoint;
  readonly pointAt: (t: number) => Point;
  readonly tangentAt: (t: number) => Vector;
}
