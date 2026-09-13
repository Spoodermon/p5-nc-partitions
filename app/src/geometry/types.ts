export type RenderCycle = readonly number[];

export interface DiagramModel {
  readonly notation: string;
  readonly vertexCount: number;
  readonly cycles: readonly RenderCycle[];
}
