// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { assertExportIsVector, serializeFigure } from "../src/export";

describe("SVG serialization", () => {
  it("serializes a standalone vector figure without raster content", () => {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("viewBox", "0 0 1000 1000");
    svg.innerHTML = [
      '<defs><marker id="arrow"><path d="M 1 1 L 9 5 L 1 9 Z" /></marker></defs>',
      '<circle cx="500" cy="500" r="370" />',
      '<path d="M 500 130 C 600 250 600 750 500 870" />',
      '<text x="500" y="100">1</text>',
    ].join("");

    const serialized = serializeFigure(svg);
    expect(() => assertExportIsVector(serialized)).not.toThrow();
    expect(serialized).toContain('viewBox="0 0 1000 1000"');
    expect(serialized).toContain("<marker");
    expect(serialized).not.toMatch(/NaN|undefined|<canvas|data:image\/(png|jpeg)/);
  });
});
