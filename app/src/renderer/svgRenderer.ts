import { SVG, type Marker, type Path, type Svg } from "@svgdotjs/svg.js";
import type { DiagramModel } from "../geometry/types";
import {
  DISC_CENTER,
  DISC_RADIUS,
  VIEWBOX_SIZE,
  createDiscLayout,
  makeDiscArc,
  type DirectedEdge,
} from "../geometry/disc";

export interface RenderOptions {
  readonly showDirection: boolean;
  readonly showRibbonFill: boolean;
  readonly selectedEdgeId: string | null;
  readonly cycleEdgeWidth: number;
  readonly outerBoundaryWidth: number;
  readonly cycleColors?: readonly string[];
  readonly numberFont?: string;
}

function closedCyclePath(paths: readonly string[]): string {
  return `${paths.map((path, index) => index === 0
    ? path
    : path.replace(/^M\s+-?[\d.]+\s+-?[\d.]+\s+/, "")).join(" ")} Z`;
}

export interface RenderCallbacks {
  readonly onSelect: (edge: DirectedEdge) => void;
}

export interface RenderResult {
  readonly svg: SVGSVGElement;
  readonly edges: readonly DirectedEdge[];
}

function createArrowMarker(draw: Svg): Marker {
  const marker = draw.marker(16, 16, (add) => {
    add.path("M 1 1 L 15 8 L 1 15 Z").fill("#334155");
  });
  marker.ref(14, 8).orient("auto");
  marker.attr({ markerUnits: "userSpaceOnUse" });
  return marker;
}

function cycleNotation(cycle: readonly number[]): string {
  return `(${cycle.join(" ")})`;
}

function labelEdge(path: Path, edge: DirectedEdge): void {
  path.attr({
    "aria-label": `${cycleNotation(edge.cycle)}, edge ${edge.start} to ${edge.end}, ${edge.role}`,
    "data-cycle": cycleNotation(edge.cycle),
    "data-edge": `${edge.start} → ${edge.end}`,
    "data-role": edge.role,
    role: "button",
    tabindex: 0,
  });
}

export function renderDiagram(
  container: HTMLElement,
  example: DiagramModel,
  options: RenderOptions,
  callbacks: RenderCallbacks,
): RenderResult {
  container.replaceChildren();

  const layout = createDiscLayout(example);
  const colors = options.cycleColors?.length ? options.cycleColors : ["#176b75"];
  const vertexById = new Map(layout.vertices.map((vertex) => [vertex.id, vertex]));
  const draw = SVG().addTo(container).size("100%", "100%").viewbox(0, 0, VIEWBOX_SIZE, VIEWBOX_SIZE);
  draw.attr({
    "aria-label": `${example.notation} permutation diagram`,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
  });

  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = `${example.notation} curved permutation diagram`;
  draw.node.prepend(title);

  const arrowMarker = createArrowMarker(draw);
  const boundaryGroup = draw.group().attr({ "data-layer": "boundary" });
  const fillGroup = draw.group().attr({ "data-layer": "cycle-fills" });
  const edgeGroup = draw.group().attr({ "data-layer": "edges" });
  const vertexGroup = draw.group().attr({ "data-layer": "vertices" });

  boundaryGroup
    .circle(DISC_RADIUS * 2)
    .center(DISC_CENTER.x, DISC_CENTER.y)
    .fill("#fffdf9")
    .stroke({ color: "#a8b2bd", width: options.outerBoundaryWidth })
    .attr({ "data-boundary": "outer" });

  const routedEdges = layout.edges.map((edge) => {
    const start = vertexById.get(edge.start);
    const end = vertexById.get(edge.end);
    if (!start || !end) throw new Error(`Missing endpoint for edge ${edge.id}`);
    return { edge, geometry: makeDiscArc(start, end, edge, example.vertexCount) };
  });

  if (options.showRibbonFill) for (let cycleIndex = 0; cycleIndex < example.cycles.length; cycleIndex += 1) {
    const paths = routedEdges.filter(({ edge }) => edge.cycleIndex === cycleIndex).map(({ geometry }) => geometry.path);
    if (paths.length === 0) continue;
    fillGroup.path(closedCyclePath(paths))
      .fill(colors[cycleIndex % colors.length] ?? colors[0] ?? "#176b75")
      .opacity(0.14)
      .stroke("none")
      .attr({ "data-cycle-fill": String(cycleIndex) });
  }

  routedEdges.forEach(({ edge, geometry }) => {
    const color = colors[edge.cycleIndex % colors.length] ?? colors[0] ?? "#176b75";
    const path = edgeGroup
      .path(geometry.path)
      .fill("none")
      .stroke({ color, width: edge.role === "return" ? options.cycleEdgeWidth * (4.2 / 3.4) : options.cycleEdgeWidth, linecap: "round", linejoin: "round" })
      .addClass("permutation-edge")
      .attr({ "data-edge-id": edge.id, "data-depth": geometry.depth });

    labelEdge(path, edge);
    if (options.showDirection) path.marker("mid", arrowMarker);
    if (options.selectedEdgeId === edge.id) path.addClass("is-selected");

    path.on("mouseenter", () => path.addClass("is-hovered"));
    path.on("mouseleave", () => path.removeClass("is-hovered"));
    path.on("click", () => callbacks.onSelect(edge));
    path.on("keydown", (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
        keyboardEvent.preventDefault();
        callbacks.onSelect(edge);
      }
    });
  });

  layout.vertices.forEach((vertex) => {
    const cycleIndex = example.cycles.findIndex((cycle) => cycle.includes(vertex.id));
    const color = colors[Math.max(0, cycleIndex) % colors.length] ?? colors[0] ?? "#176b75";
    vertexGroup.circle(17).center(vertex.x, vertex.y).fill(color).stroke({ color: "#ffffff", width: 2.5 });
    vertexGroup
      .text(String(vertex.id))
      .font({ family: options.numberFont ?? "Newsreader, Georgia, 'Times New Roman', serif", size: 28, anchor: "middle", weight: 600 })
      .fill("#172033")
      .center(vertex.labelPosition.x, vertex.labelPosition.y);
  });

  draw
    .text(example.notation)
    .font({ family: options.numberFont ?? "Newsreader, Georgia, 'Times New Roman', serif", size: 24, anchor: "middle" })
    .fill("#475569")
    .center(DISC_CENTER.x, 966);

  return { svg: draw.node, edges: layout.edges };
}
