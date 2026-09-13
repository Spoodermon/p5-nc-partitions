import type { Svg } from "@svgdotjs/svg.js";

/** Keep captions legible; the complete mathematical input stays in SVG metadata. */
export function renderCaption(draw: Svg, notation: string, font: string): void {
  const abbreviated = notation.length > 80;
  const visible = abbreviated ? `${notation.slice(0, 38)} … ${notation.slice(-38)}` : notation;
  const caption = draw.plain(visible)
    .font({ family: font, size: 20 })
    .fill("#607080")
    .attr({ x: 500, y: 968, "text-anchor": "middle", "dominant-baseline": "middle", "data-diagram-caption": "true", "aria-label": notation });
  // Explicit SVG text fitting survives font loading and standalone export.
  // Long captions have a bounded character count before any compression.
  if (notation.length > 60) caption.attr({ textLength: 900, lengthAdjust: "spacingAndGlyphs" });
  const description = draw.node.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "desc");
  description.setAttribute("data-full-notation", "true");
  description.textContent = notation;
  draw.node.insertBefore(description, draw.node.querySelector("title")?.nextSibling ?? draw.node.firstChild);
}
