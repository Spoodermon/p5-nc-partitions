import type { AnnularLayout } from "../annular";
import type { BoundaryLinearPosition, SeamState } from "./types";

const TWO_PI = 2 * Math.PI;

function boundaryPositions(
  layout: AnnularLayout,
  boundary: "outer" | "inner",
  seam: number,
): readonly BoundaryLinearPosition[] {
  const size = boundary === "outer" ? layout.p : layout.q;
  if (!Number.isInteger(seam) || seam < 0 || seam >= size) throw new RangeError(`${boundary} seam out of range`);
  const firstIndex = (seam + 1) % size;
  const firstLabel = boundary === "outer" ? firstIndex + 1 : layout.p + firstIndex + 1;
  const firstAngle = layout.vertices[firstLabel - 1]?.angle;
  if (firstAngle === undefined) throw new Error("layout vertex invariant violated");
  const direction = boundary === "outer" ? 1 : -1;
  const step = TWO_PI / size;
  const positions = Array.from({ length: size }, (_, labelIndex) => {
    const rank = (labelIndex - firstIndex + size) % size;
    return Object.freeze({
      label: boundary === "outer" ? labelIndex + 1 : layout.p + labelIndex + 1,
      rank,
      liftAngle: firstAngle + direction * step * rank,
    });
  });
  return Object.freeze(positions);
}

export function createSeamState(layout: AnnularLayout, outerSeam: number, innerSeam: number): SeamState {
  return Object.freeze({
    outerSeam,
    innerSeam,
    outerPositions: boundaryPositions(layout, "outer", outerSeam),
    innerPositions: boundaryPositions(layout, "inner", innerSeam),
  });
}

export function boundaryPosition(state: SeamState, label: number, p: number): BoundaryLinearPosition {
  const positions = label <= p ? state.outerPositions : state.innerPositions;
  const result = positions.find((position) => position.label === label);
  if (!result) throw new RangeError(`label ${label} is not in seam state`);
  return result;
}

export function annularSeamStates(layout: AnnularLayout): readonly SeamState[] {
  const states: SeamState[] = [];
  for (let outerSeam = 0; outerSeam < layout.p; outerSeam += 1) {
    for (let innerSeam = 0; innerSeam < layout.q; innerSeam += 1) {
      states.push(createSeamState(layout, outerSeam, innerSeam));
    }
  }
  return Object.freeze(states);
}

