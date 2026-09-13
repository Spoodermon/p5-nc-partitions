import { resolveNumberFont } from "./fonts";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function embedNumberFont(svg: SVGSVGElement, fontId: string | undefined): void {
  const font = resolveNumberFont(fontId);
  if (!font.dataUrl.startsWith("data:font/woff2;base64,")) {
    throw new Error(`Embedded ${font.id} font is not a WOFF2 data URL`);
  }

  let defs = Array.from(svg.children).find((element) => element.localName === "defs") as SVGDefsElement | undefined;
  if (!defs) {
    defs = svg.ownerDocument.createElementNS(SVG_NAMESPACE, "defs");
    svg.insertBefore(defs, svg.firstChild);
  }

  const style = svg.ownerDocument.createElementNS(SVG_NAMESPACE, "style");
  style.setAttribute("data-export-font", font.id);
  style.textContent = `@font-face{font-family:${font.exportFamily};src:url("${font.dataUrl}") format("woff2");font-style:normal;font-weight:${font.weightRange};font-display:block;}`;
  defs.prepend(style);

  svg.querySelectorAll("text, tspan, textPath").forEach((element) => {
    element.setAttribute("font-family", font.exportFamily);
  });
}

export function serializeFigure(svg: SVGSVGElement, fontId = "Newsreader"): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", SVG_NAMESPACE);
  clone.setAttribute("width", "1000");
  clone.setAttribute("height", "1000");
  clone.removeAttribute("style");

  clone.querySelectorAll(".is-selected, .is-hovered").forEach((element) => {
    element.classList.remove("is-selected", "is-hovered");
  });
  clone.querySelectorAll("[tabindex]").forEach((element) => element.removeAttribute("tabindex"));
  clone.querySelectorAll("[data-editor-overlay]").forEach((element) => element.remove());
  embedNumberFont(clone, fontId);

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

export function assertExportIsVector(svgText: string): void {
  const inspectableSvg = svgText.replace(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g, "data:font/woff2;base64,[font-data]");
  const forbidden = ["NaN", "undefined", "<canvas", "<foreignObject", "<script", "data:image/png", "data:image/jpeg"];
  const violation = forbidden.find((token) => inspectableSvg.includes(token));
  if (violation) throw new Error(`Export contains forbidden token: ${violation}`);

  if (!svgText.includes("<svg") || !svgText.includes("viewBox=")) {
    throw new Error("Export must contain an SVG root with a viewBox");
  }
  if (!svgText.includes("<path") || !svgText.includes("<circle") || !svgText.includes("<text")) {
    throw new Error("Export is missing required vector primitives");
  }
}

export function downloadSvg(svg: SVGSVGElement, filename: string, fontId = "Newsreader"): void {
  const svgText = serializeFigure(svg, fontId);
  assertExportIsVector(svgText);
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
