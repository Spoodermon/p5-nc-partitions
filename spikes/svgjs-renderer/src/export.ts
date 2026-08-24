const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function serializeFigure(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", SVG_NAMESPACE);
  clone.setAttribute("width", "1000");
  clone.setAttribute("height", "1000");
  clone.removeAttribute("style");

  clone.querySelectorAll(".is-selected, .is-hovered").forEach((element) => {
    element.classList.remove("is-selected", "is-hovered");
  });
  clone.querySelectorAll("[tabindex]").forEach((element) => element.removeAttribute("tabindex"));

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

export function assertExportIsVector(svgText: string): void {
  const forbidden = ["NaN", "undefined", "<canvas", "data:image/png", "data:image/jpeg"];
  const violation = forbidden.find((token) => svgText.includes(token));
  if (violation) throw new Error(`Export contains forbidden token: ${violation}`);

  if (!svgText.includes("<svg") || !svgText.includes("viewBox=")) {
    throw new Error("Export must contain an SVG root with a viewBox");
  }
  if (!svgText.includes("<path") || !svgText.includes("<circle") || !svgText.includes("<text")) {
    throw new Error("Export is missing required vector primitives");
  }
}

export function downloadSvg(svg: SVGSVGElement, filename: string): void {
  const svgText = serializeFigure(svg);
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
