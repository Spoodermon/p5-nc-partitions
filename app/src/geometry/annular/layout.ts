import type { AnnularBoundary, AnnularLayout, AnnularVertex, Point } from "./types";

export const ANNULAR_VIEWBOX_SIZE = 1000;
export const ANNULAR_CENTER = Object.freeze({ x: 500, y: 500 });
export const ANNULAR_OUTER_RADIUS = 370;
export const ANNULAR_INNER_RADIUS = 170;
export const OUTER_LABEL_RADIUS = 414;
export const INNER_LABEL_RADIUS = 126;

export interface AnnularLayoutOptions {
  readonly innerPhase?: number;
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
}

export function greatestCommonDivisor(a: number, b: number): number {
  requirePositiveInteger(a, "a");
  requirePositiveInteger(b, "b");
  let left = a;
  let right = b;
  while (right !== 0) {
    [left, right] = [right, left % right];
  }
  return left;
}

export function leastCommonMultiple(a: number, b: number): number {
  return (a / greatestCommonDivisor(a, b)) * b;
}

export function defaultAnnularPhase(p: number, q: number): number {
  return Math.PI / leastCommonMultiple(p, q);
}

export function pointAtPolar(center: Point, radius: number, angle: number): Point {
  return Object.freeze({
    x: center.x + radius * Math.cos(angle),
    y: center.y + radius * Math.sin(angle),
  });
}

function vertex(
  label: number,
  boundary: AnnularBoundary,
  angle: number,
  radius: number,
  labelRadius: number,
): AnnularVertex {
  return Object.freeze({
    label,
    boundary,
    angle,
    boundaryPoint: pointAtPolar(ANNULAR_CENTER, radius, angle),
    labelPoint: pointAtPolar(ANNULAR_CENTER, labelRadius, angle),
  });
}

export function createAnnularLayout(p: number, q: number, options: AnnularLayoutOptions = {}): AnnularLayout {
  requirePositiveInteger(p, "p");
  requirePositiveInteger(q, "q");
  const innerPhase = options.innerPhase ?? defaultAnnularPhase(p, q);
  if (!Number.isFinite(innerPhase)) throw new RangeError("innerPhase must be finite");

  const outerVertices = Array.from({ length: p }, (_, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / p;
    return vertex(index + 1, "outer", angle, ANNULAR_OUTER_RADIUS, OUTER_LABEL_RADIUS);
  });
  const innerVertices = Array.from({ length: q }, (_, index) => {
    const angle = -Math.PI / 2 + innerPhase - (2 * Math.PI * index) / q;
    return vertex(p + index + 1, "inner", angle, ANNULAR_INNER_RADIUS, INNER_LABEL_RADIUS);
  });

  return Object.freeze({
    p,
    q,
    center: ANNULAR_CENTER,
    outerRadius: ANNULAR_OUTER_RADIUS,
    innerRadius: ANNULAR_INNER_RADIUS,
    innerPhase,
    vertices: Object.freeze([...outerVertices, ...innerVertices]),
  });
}

export function annularVertex(layout: AnnularLayout, label: number): AnnularVertex {
  if (!Number.isInteger(label) || label < 1 || label > layout.p + layout.q) {
    throw new RangeError(`label must be in [1, ${layout.p + layout.q}]`);
  }
  const result = layout.vertices[label - 1];
  if (!result) throw new Error("Annular layout invariant violated");
  return result;
}
