import { SVG, type Path } from "@svgdotjs/svg.js";
import { ANNULAR_VIEWBOX_SIZE, cartesianToCoverPoint, coverPointToCartesian, type AnnularRoute, type Point, type Vector } from "../geometry/annular";
import { annularCycleFillRegions, createEditedCoverCubicRoute, isEditableCoverCubic, type AnnularDirectedEdge, type CoverCubicControlEdit } from "../geometry/annular-routing";
import type { AnnularDiagramModel } from "./annularModel";

export interface AnnularRenderOptions {
  readonly showDirection: boolean;
  readonly showRibbonFill: boolean;
  readonly selectedEdgeId: string | null;
  readonly cycleEdgeWidth: number;
  readonly outerBoundaryWidth: number;
  readonly innerBoundaryWidth: number;
  readonly cycleColors?: readonly string[];
  readonly numberFont?: string;
}

export interface AnnularRenderCallbacks {
  readonly onSelect: (edge: AnnularDirectedEdge) => void;
  readonly onCurveEditCommit?: (edgeId: string, controls: CoverCubicControlEdit, restoreFocusToControl?: 1 | 2) => void;
  readonly onCurveEditCancel?: () => void;
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

function arrowPath(point: Point, tangent: Vector): string | null {
  const length = Math.hypot(tangent.x, tangent.y);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
    || !Number.isFinite(tangent.x) || !Number.isFinite(tangent.y)
    || length <= 1e-8) return null;
  const unit = { x: tangent.x / length, y: tangent.y / length };
  const normal = { x: -unit.y, y: unit.x };
  return `M ${format(point.x + unit.x * 10)} ${format(point.y + unit.y * 10)} L ${format(point.x - unit.x * 7 + normal.x * 5)} ${format(point.y - unit.y * 7 + normal.y * 5)} L ${format(point.x - unit.x * 7 - normal.x * 5)} ${format(point.y - unit.y * 7 - normal.y * 5)} Z`;
}

export function annularDirectionMarkerPath(route: AnnularRoute): string | null {
  for (const t of [0.5, 0.48, 0.52, 0.4, 0.6, 0.25, 0.75]) {
    const path = arrowPath(route.pointAt(t), route.tangentAt(t));
    if (path) return path;
  }
  return null;
}

function closedPath(points: readonly Point[]): string {
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${format(point.x)} ${format(point.y)}`).join(" ")} Z`;
}

function cycleNotation(cycle: readonly number[]): string { return `(${cycle.join(" ")})`; }

function nearestLiftedAngle(angle: number, reference: number): number {
  return angle + Math.round((reference - angle) / (2 * Math.PI)) * 2 * Math.PI;
}

function pointerInViewBox(svg: SVGSVGElement, event: PointerEvent): Point | null {
  try {
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return Number.isFinite(transformed.x) && Number.isFinite(transformed.y)
      ? Object.freeze({ x: transformed.x, y: transformed.y })
      : null;
  } catch {
    return null;
  }
}

function clampToAnnulus(point: Point, center: Point, innerRadius: number, outerRadius: number): Point {
  const x = point.x - center.x;
  const y = point.y - center.y;
  const rawRadius = Math.hypot(x, y);
  const angle = rawRadius > 0 ? Math.atan2(y, x) : 0;
  const radius = Math.min(outerRadius - 0.5, Math.max(innerRadius + 0.5, rawRadius));
  return Object.freeze({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
}

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
  const editorGroup = draw.group().attr({ "data-layer": "curve-editor", "data-editor-overlay": "true" });
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
    if (options.showDirection) {
      const directionPath = annularDirectionMarkerPath(candidate.route);
      if (directionPath) markerGroup.path(directionPath).fill(color).attr({ "data-direction-marker": candidate.edge.id });
    }
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
    const labelSize = vertex.boundary === "inner" ? 21.6 : 24;
    vertexGroup.plain(String(vertex.label)).font({ family: options.numberFont ?? "'Newsreader Variable', Georgia, serif", size: labelSize, weight: 600 }).fill("#192333").attr({
      x: vertex.labelPoint.x, y: vertex.labelPoint.y, "text-anchor": "middle", "dominant-baseline": "middle",
    });
  });

  const editable = routed.routes.find((candidate) => candidate.edge.id === options.selectedEdgeId);
  if (isEditableCoverCubic(editable) && callbacks.onCurveEditCommit) {
    const original = editable.route.controlPoints;
    editorGroup.attr({
      "data-start-theta": String(original[0].theta),
      "data-end-theta": String(original[3].theta),
      "data-inner-radius": String(routed.layout.innerRadius),
      "data-outer-radius": String(routed.layout.outerRadius),
      "data-center-x": String(routed.layout.center.x),
      "data-center-y": String(routed.layout.center.y),
    });
    let controls: CoverCubicControlEdit = {
      control1: Object.freeze({ ...original[1] }),
      control2: Object.freeze({ ...original[2] }),
    };
    const anchors = [editable.route.pointAt(0), editable.route.pointAt(1)] as const;
    const controlPositions = () => [
      coverPointToCartesian(routed.layout, controls.control1),
      coverPointToCartesian(routed.layout, controls.control2),
    ] as const;
    const initialPositions = controlPositions();
    const guides = [
      editorGroup.line(anchors[0].x, anchors[0].y, initialPositions[0].x, initialPositions[0].y),
      editorGroup.line(anchors[1].x, anchors[1].y, initialPositions[1].x, initialPositions[1].y),
    ];
    guides.forEach((guide) => guide.stroke({ color: "#6b7280", width: 1.5, dasharray: "6 5" }).attr({ "vector-effect": "non-scaling-stroke" }));
    const hitHandles = initialPositions.map((position, index) => editorGroup.circle(18).center(position.x, position.y)
      .fill("none").stroke({ color: "#0f766e", width: 32, opacity: 0.001 })
      .addClass("curve-control-hit-target")
      .attr({ "data-control-hit-index": String(index + 1), "vector-effect": "non-scaling-stroke", "pointer-events": "stroke" }));
    const handles = initialPositions.map((position, index) => editorGroup.circle(18).center(position.x, position.y)
      .fill("#fffdf9").stroke({ color: "#0f766e", width: 3 })
      .addClass("curve-control-handle")
      .attr({
        "data-control-index": String(index + 1),
        role: "button",
        tabindex: 0,
        "aria-keyshortcuts": "ArrowLeft ArrowRight ArrowUp ArrowDown",
        "aria-label": `Bézier control ${index + 1} for edge ${editable.edge.startLabel} to ${editable.edge.endLabel}; drag it, or use arrow keys to adjust angle and radius`,
      }));
    const selectedPath = draw.node.querySelector<SVGPathElement>(`[data-edge-id="${editable.edge.id}"]`);
    const directionMarker = draw.node.querySelector<SVGPathElement>(`[data-direction-marker="${editable.edge.id}"]`);
    const fillPath = draw.node.querySelector<SVGPathElement>(`[data-cycle-fill="${editable.edge.cycleIndex}"]`);

    const preview = (): void => {
      const route = createEditedCoverCubicRoute(routed, editable, controls);
      selectedPath?.setAttribute("d", sampledAnnularPath(route));
      if (directionMarker) {
        const directionPath = annularDirectionMarkerPath(route);
        if (directionPath) { directionMarker.setAttribute("d", directionPath); directionMarker.removeAttribute("display"); }
        else directionMarker.setAttribute("display", "none");
      }
      if (fillPath) {
        const routes = routed.routes.map((candidate) => candidate.edge.id === editable.edge.id ? Object.freeze({ ...candidate, route }) : candidate);
        const region = annularCycleFillRegions(routes).find((candidate) => candidate.cycleIndex === editable.edge.cycleIndex);
        if (region) fillPath.setAttribute("d", closedPath(region.points));
      }
      const positions = controlPositions();
      handles.forEach((handle, index) => handle.center((positions[index] as Point).x, (positions[index] as Point).y));
      hitHandles.forEach((handle, index) => handle.center((positions[index] as Point).x, (positions[index] as Point).y));
      guides[0]?.plot(anchors[0].x, anchors[0].y, positions[0].x, positions[0].y);
      guides[1]?.plot(anchors[1].x, anchors[1].y, positions[1].x, positions[1].y);
    };

    handles.forEach((handle, index) => {
      let dragging = false;
      let moved = false;
      const originalTheta = original[index + 1]?.theta ?? 0;
      const moveTo = (point: Point): boolean => {
        const contained = clampToAnnulus(point, routed.layout.center, routed.layout.innerRadius, routed.layout.outerRadius);
        const cover = cartesianToCoverPoint(routed.layout, contained);
        const next = Object.freeze({ theta: nearestLiftedAngle(cover.theta, originalTheta), u: cover.u });
        const current = index === 0 ? controls.control1 : controls.control2;
        if (Math.abs(next.theta - current.theta) <= 1e-12 && Math.abs(next.u - current.u) <= 1e-12) return false;
        controls = index === 0
          ? Object.freeze({ ...controls, control1: next })
          : Object.freeze({ ...controls, control2: next });
        preview();
        return true;
      };
      for (const pointerTarget of [hitHandles[index]?.node, handle.node]) {
        if (!pointerTarget) continue;
        pointerTarget.addEventListener("pointerdown", (event) => {
          event.preventDefault(); event.stopPropagation(); dragging = true; moved = false;
          editorGroup.addClass("is-dragging");
          try { pointerTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional in synthetic DOMs. */ }
        });
        pointerTarget.addEventListener("pointermove", (event) => {
          if (!dragging) return;
          const point = pointerInViewBox(draw.node, event);
          if (point) moved = moveTo(point) || moved;
        });
        pointerTarget.addEventListener("pointerup", (event) => {
          if (!dragging) return;
          dragging = false; editorGroup.removeClass("is-dragging");
          try { pointerTarget.releasePointerCapture(event.pointerId); } catch { /* See setPointerCapture above. */ }
          if (moved) callbacks.onCurveEditCommit?.(editable.edge.id, controls);
          else callbacks.onCurveEditCancel?.();
        });
        const cancel = (): void => {
          if (!dragging) return;
          dragging = false; editorGroup.removeClass("is-dragging");
          callbacks.onCurveEditCancel?.();
        };
        pointerTarget.addEventListener("pointercancel", cancel);
        pointerTarget.addEventListener("lostpointercapture", cancel);
      }
      handle.node.addEventListener("keydown", (event) => {
        const step = event.shiftKey ? 0.08 : 0.025;
        const current = index === 0 ? controls.control1 : controls.control2;
        let next = current;
        if (event.key === "ArrowLeft") next = Object.freeze({ ...current, theta: current.theta - step });
        else if (event.key === "ArrowRight") next = Object.freeze({ ...current, theta: current.theta + step });
        else if (event.key === "ArrowUp") next = Object.freeze({ ...current, u: Math.min(0.999, current.u + step) });
        else if (event.key === "ArrowDown") next = Object.freeze({ ...current, u: Math.max(0.001, current.u - step) });
        else return;
        event.preventDefault(); event.stopPropagation();
        controls = index === 0 ? Object.freeze({ ...controls, control1: next }) : Object.freeze({ ...controls, control2: next });
        preview();
        callbacks.onCurveEditCommit?.(editable.edge.id, controls, (index + 1) as 1 | 2);
      });
    });
  }
  draw.plain(`${model.notation}  ·  (p,q)=(${model.permutation.p},${model.permutation.q})`).font({ family: options.numberFont ?? "'Newsreader Variable', Georgia, serif", size: 20 }).fill("#607080").attr({
    x: 500, y: 968, "text-anchor": "middle", "dominant-baseline": "middle",
  });
  return { svg: draw.node, edges: routed.routes.map(({ edge }) => edge) };
}
