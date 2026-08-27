// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { assertExportIsVector, serializeFigure } from "../src/renderer/export";
import { installNumberFonts, NUMBER_FONT_IDS, resolveNumberFont } from "../src/renderer/fonts";

function vectorFigure(): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 1000 1000");
  svg.innerHTML = [
    '<defs><marker id="arrow"><path d="M 1 1 L 9 5 L 1 9 Z" /></marker></defs>',
    '<circle cx="500" cy="500" r="370" />',
    '<path d="M 500 130 C 600 250 600 750 500 870" />',
    '<text x="500" y="100" font-family="Fallback"><tspan>1</tspan></text>',
  ].join("");
  return svg;
}

describe("SVG serialization", () => {
  it("serializes a standalone vector figure without raster content", () => {
    const serialized = serializeFigure(vectorFigure());
    expect(() => assertExportIsVector(serialized)).not.toThrow();
    expect(serialized).toContain('viewBox="0 0 1000 1000"');
    expect(serialized).toContain("<marker");
    expect(serialized.replace(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g, "[font-data]"))
      .not.toMatch(/NaN|undefined|<canvas|data:image\/(png|jpeg)/);
  });

  it("embeds exactly the selected WOFF2 and rewrites exported text to use it", () => {
    for (const fontId of NUMBER_FONT_IDS) {
      const selected = resolveNumberFont(fontId);
      const serialized = serializeFigure(vectorFigure(), fontId);
      const dataUrl = serialized.match(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/)?.[1];

      expect(serialized).toContain(`data-export-font="${fontId}"`);
      expect(serialized.match(/@font-face/g)).toHaveLength(1);
      expect(serialized).toContain(`font-family:${selected.exportFamily}`);
      expect(serialized).toContain(`font-family="${selected.exportFamily}"`);
      expect(serialized).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com|src:url\(["']https?:\/\//);
      expect(dataUrl).toBeTruthy();
      expect(atob(dataUrl ?? "").slice(0, 4)).toBe("wOF2");

      for (const otherId of NUMBER_FONT_IDS.filter((candidate) => candidate !== fontId)) {
        const otherFamily = resolveNumberFont(otherId).exportFamily;
        expect(serialized).not.toContain(`font-family:${otherFamily};`);
        expect(serialized).not.toContain(`font-family="${otherFamily}"`);
      }
    }
  });

  it("falls back deterministically when an unknown font id is supplied", () => {
    const serialized = serializeFigure(vectorFigure(), "not-a-font");
    expect(serialized).toContain('data-export-font="Newsreader"');
    expect(serialized).toContain('font-family="PVEmbeddedNewsreader"');
  });

  it("installs the same three local font binaries for the live interface exactly once", () => {
    document.querySelector("#permutation-visualizer-fonts")?.remove();
    installNumberFonts(document);
    installNumberFonts(document);
    const styles = document.querySelectorAll<HTMLStyleElement>("#permutation-visualizer-fonts");
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent?.match(/@font-face/g)).toHaveLength(3);
    expect(styles[0]?.textContent?.match(/data:font\/woff2;base64,/g)).toHaveLength(3);
  });
});
