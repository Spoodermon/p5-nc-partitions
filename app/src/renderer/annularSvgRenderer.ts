import { SVG, type Path, type Svg } from "@svgdotjs/svg.js";
import { ANNULAR_VIEWBOX_SIZE, type AnnularRoute, type Point, type Vector } from "../geometry/annular";
import { annularCycleFillRegions, type AnnularDirectedEdge } from "../geometry/annular-routing";
import type { AnnularDiagramModel } from "./annularModel";

export interface AnnularRenderOptions {
  readonly showDirection: boolean;
  readonly showRibbonFill: boolean;
  readonly selectedEdgeId: string | null;
  readonly cycleEdgeWidth: number;
  readonly outerBoundaryWidth: number;
  readonly innerBoundaryWidth: number;
  readonly cycleColors?: readonly string[];
}

export interface AnnularRenderCallbacks {
  readonly onSelect: (edge: AnnularDirectedEdge) => void;
}

export interface AnnularRenderResult {
  readonly svg: SVGSVGElement;
  readonly edges: readonly AnnularDirectedEdge[];
}

function format(value: number): string { return Number(value.toFixed(3)).toString(); }

export function sampledAnnularPath(route: AnnularRoute): string {
  return Array.from({ length: 161 }, (_, index) => route.pointAt(index / 160))
    .map((point, index) => `${index === 0 ? "M" : "L"} ${format(point.x)} ${format(point.y)}`).join(" ");
}

function arrowPath(point: Point, tangent: Vector): string {
  const length = Math.hypot(tangent.x, tangent.y);
  const unit = { x: tangent.x / length, y: tangent.y / length };
  const normal = { x: -unit.y, y: unit.x };
  return `M ${format(point.x + unit.x * 10)} ${format(point.y + unit.y * 10)} L ${format(point.x - unit.x * 7 + normal.x * 5)} ${format(point.y - unit.y * 7 + normal.y * 5)} L ${format(point.x - unit.x * 7 - normal.x * 5)} ${format(point.y - unit.y * 7 - normal.y * 5)} Z`;
}

function closedPath(points: readonly Point[]): string {
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${format(point.x)} ${format(point.y)}`).join(" ")} Z`;
}

function cycleNotation(cycle: readonly number[]): string { return `(${cycle.join(" ")})`; }

function labelEdge(path: Path, edge: AnnularDirectedEdge, model: AnnularDiagramModel): void {
  const cycle = model.cycles[edge.cycleIndex];
  if (!cycle) throw new Error(`Missing cycle metadata for ${edge.id}`);
  path.attr({
    "aria-label": `${cycleNotation(cycle.cycle)}, edge ${edge.startLabel} to ${edge.endLabel}, ${cycle.kind}, ${edge.role}`,
    "data-cycle": cycleNotation(cycle.cycle),
    "data-edge": `${edge.startLabel} → ${edge.endLabel}`,
    "data-cycle-kind": cycle.kind,
    "data-role": edge.role,
    role: "button",
    tabindex: 0,
  });
}

export function renderAnnularDiagram(
  container: HTMLElement,
  model: AnnularDiagramModel,
  options: AnnularRenderOptions,
  callbacks: AnnularRenderCallbacks,
): AnnularRenderResult {
  container.replaceChildren();
  const { routed } = model;
  const colors = options.cycleColors?.length ? options.cycleColors : ["#285f6b"];
  const draw = SVG().addTo(container).size("100%", "100%").viewbox(0, 0, ANNULAR_VIEWBOX_SIZE, ANNULAR_VIEWBOX_SIZE);
  draw.attr({ role: "img", "aria-label": `${model.notation} annular permutation diagram for p ${model.permutation.p}, q ${model.permutation.q}`, preserveAspectRatio: "xMidYMid meet" });
  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = `${model.notation}, annular permutation (${model.permutation.p},${model.permutation.q})`;
  draw.node.prepend(title);

  const boundaryGroup = draw.group().attr({ "data-layer": "boundary" });
  const fillGroup = draw.group().attr({ "data-layer": "cycle-fills" });
  const edgeGroup = draw.group().attr({ "data-layer": "edges" });
  const markerGroup = draw.group().attr({ "data-layer": "direction-markers" });
  const vertexGroup = draw.group().attr({ "data-layer": "vertices" });
  boundaryGroup.circle(routed.layout.outerRadius * 2).center(500, 500).fill("#fffdf9").stroke({ color: "#aeb9c0", width: options.outerBoundaryWidth }).attr({ "data-boundary": "outer" });
  boundaryGroup.circle(routed.layout.innerRadius * 2).center(500, 500).fill("#edf1f3").stroke({ color: "#aeb9c0", width: options.innerBoundaryWidth }).attr({ "data-boundary": "inner" });

  if (options.showRibbonFill) for (const region of annularCycleFillRegions(routed.routes)) {
    fillGroup.path(closedPath(region.points)).fill(colors[region.cycleIndex % colors.length] as string).opacity(0.14).stroke("none").attr({ "data-cycle-fill": String(region.cycleIndex) });
  }

  routed.routes.forEach((candidate) => {
    const color = colors[candidate.edge.cycleIndex % colors.length] as string;
    const path = edgeGroup.path(sampledAnnularPath(candidate.route)).fill("none")
      .stroke({ color, width: options.cycleEdgeWidth, linecap: "round", linejoin: "round" })
      .addClass("permutation-edge")
      .attr({ "data-edge-id": candidate.edge.id, "data-cycle-edge": candidate.edge.id });
    labelEdge(path, candidate.edge, model);
    if (options.selectedEdgeId === candidate.edge.id) path.addClass("is-selected");
    if (options.showDirection) markerGroup.path(arrowPath(candidate.route.pointAt(0.5), candidate.route.tangentAt(0.5))).fill(color).attr({ "data-direction-marker": candidate.edge.id });
    path.on("mouseenter", () => path.addClass("is-hovered"));
    path.on("mouseleave", () => path.removeClass("is-hovered"));
    path.on("click", () => callbacks.onSelect(candidate.edge));
    path.on("keydown", (event: Event) => {
      const key = (event as KeyboardEvent).key;
      if (key === "Enter" || key === " ") { event.preventDefault(); callbacks.onSelect(candidate.edge); }
    });
  });

  routed.layout.vertices.forEach((vertex) => {
    const color = vertex.boundary === "outer" ? "#285f6b" : "#9a552d";
    vertexGroup.circle(15).center(vertex.boundaryPoint.x, vertex.boundaryPoint.y).fill(color).stroke({ color: "white", width: 2 });
    vertexGroup.plain(String(vertex.label)).font({ family: "Georgia, serif", size: 24, weight: 600 }).fill("#192333").attr({
      x: vertex.labelPoint.x, y: vertex.labelPoint.y, "text-anchor": "middle", "dominant-baseline": "middle",
    });
  });
  draw.plain(`${model.notation}  ·  (p,q)=(${model.permutation.p},${model.permutation.q})`).font({ family: "Georgia, serif", size: 20 }).fill("#607080").attr({
    x: 500, y: 968, "text-anchor": "middle", "dominant-baseline": "middle",
  });
  return { svg: draw.node, edges: routed.routes.map(({ edge }) => edge) };
}
