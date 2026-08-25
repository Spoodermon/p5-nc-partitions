import type { DiscPartition } from "../math";
import type { AcceptedAnnularInput } from "./annularController";

export type SurfaceMode = "disc" | "annular";

/** Retains the last admitted mathematical object independently for each surface. */
export class ProductionSurfaceState {
  mode: SurfaceMode = "disc";
  discPartition: DiscPartition;
  annular: AcceptedAnnularInput;

  constructor(discPartition: DiscPartition, annular: AcceptedAnnularInput) {
    this.discPartition = discPartition;
    this.annular = annular;
  }

  switchTo(mode: SurfaceMode): void { this.mode = mode; }
}
