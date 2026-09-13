import { SVG, type Marker, type Path, type Svg } from "@svgdotjs/svg.js";
import { renderCaption } from "./caption";
import type { DiagramModel } from "../geometry/types";
import {
  DISC_CENTER,
  DISC_RADIUS,
  VIEWBOX_SIZE,
  createDiscArcFromControls,
  type DirectedEdge,
  type Point,
} from "../geometry/disc";
import {
  createDiscGeometryState,
  isVerifiedDiscGeometryState,
  type DiscCubicControlEdit,
  type DiscGeometryState,
} from "../geometry/disc-editing";

export interface RenderOptions {
  readonly showDirection: boolean;
  readonly showRibbonFill: boolean;
  readonly selectedEdgeId: string | null;
  readonly cycleEdgeWidth: number;
  readonly outerBoundaryWidth: number;
  /**
   * A full-viewBox SVG background. Omit it for the legacy presentation, pass
   * a colour to include an exportable background, or pass null for a truly
   * transparent figure.
   */
  readonly backgroundColor?: string | null;
  readonly cycleColors?: readonly string[];
  readonly numberFont?: string;
  /** Diameter of each boundary dot in SVG viewBox units. */
  readonly boundaryDotSize?: number;
}

function closedCyclePath(paths: readonly string[]): string {
  return `${paths.map((path, index) => index === 0
    ? path
    : path.replace(/^M\s+-?[\d.]+\s+-?[\d.]+\s+/, "")).join(" ")} Z`;
}

export interface RenderCallbacks {
  readonly onSelect: (edge: DirectedEdge, restoreFocusToControl?: 1) => void;
  readonly onCurveEditCommit?: (edgeId: string, controls: DiscCubicControlEdit, restoreFocusToControl?: 1 | 2) => void;
  readonly onCurveEditCancel?: (restoreFocusToControl?: 1 | 2) => void;
  readonly onCurvePreviewChange?: (active: boolean) => void;
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

function clampToDisc(point: Point): Point {
  const x = point.x - DISC_CENTER.x;
  const y = point.y - DISC_CENTER.y;
  const rawRadius = Math.hypot(x, y);
  const radius = Math.min(DISC_RADIUS - 0.5, rawRadius);
  if (rawRadius <= DISC_RADIUS - 0.5) return Object.freeze({ ...point });
  return Object.freeze({
    x: DISC_CENTER.x + x * radius / rawRadius,
    y: DISC_CENTER.y + y * radius / rawRadius,
  });
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
  input: DiagramModel | DiscGeometryState,
  options: RenderOptions,
  callbacks: RenderCallbacks,
): RenderResult {
  container.replaceChildren();

  const state = "routes" in input ? input : createDiscGeometryState(input);
  if (!isVerifiedDiscGeometryState(state)) throw new Error("Disc renderer requires a verified geometry state");
  const { layout, model: example } = state;
  const colors = options.cycleColors?.length ? options.cycleColors : ["#176b75"];
  const draw = SVG().addTo(container).size("100%", "100%").viewbox(0, 0, VIEWBOX_SIZE, VIEWBOX_SIZE);
  draw.attr({
    "aria-label": `${example.notation} permutation diagram`,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "data-presentation": state.compactPresentation ? "compact" : "curved",
  });

  const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = `${example.notation} curved permutation diagram`;
  draw.node.prepend(title);

  if (typeof options.backgroundColor === "string") {
    draw.rect(VIEWBOX_SIZE, VIEWBOX_SIZE)
      .move(0, 0)
      .fill(options.backgroundColor)
      .attr({ "data-diagram-background": "true", "pointer-events": "none" });
  }

  const arrowMarker = createArrowMarker(draw);
  const boundaryGroup = draw.group().attr({ "data-layer": "boundary" });
  const fillGroup = draw.group().attr({ "data-layer": "cycle-fills" });
  const edgeGroup = draw.group().attr({ "data-layer": "edges" });
  const vertexGroup = draw.group().attr({ "data-layer": "vertices" });
  const editorGroup = draw.group().attr({ "data-layer": "curve-editor", "data-editor-overlay": "true" });

  boundaryGroup
    .circle(DISC_RADIUS * 2)
    .center(DISC_CENTER.x, DISC_CENTER.y)
    .fill(options.backgroundColor === undefined ? "#fffdf9" : "none")
    .stroke({ color: "#a8b2bd", width: options.outerBoundaryWidth })
    .attr({ "data-boundary": "outer" });

  const routedEdges = state.routes;

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
      .stroke({ color, width: options.cycleEdgeWidth, linecap: "round", linejoin: "round" })
      .addClass("permutation-edge")
      .attr({ "data-edge-id": edge.id, "data-depth": geometry.depth, "vector-effect": "non-scaling-stroke" });

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
        callbacks.onSelect(edge, 1);
      }
    });
  });

  layout.vertices.forEach((vertex) => {
    const cycleIndex = example.cycles.findIndex((cycle) => cycle.includes(vertex.id));
    const color = colors[Math.max(0, cycleIndex) % colors.length] ?? colors[0] ?? "#176b75";
    vertexGroup.circle(options.boundaryDotSize ?? 17).center(vertex.x, vertex.y).fill(color).stroke({ color: "#ffffff", width: 2.5 });
    vertexGroup
      .text(String(vertex.id))
      .font({ family: options.numberFont ?? "'Newsreader Variable', Georgia, 'Times New Roman', serif", size: 28, anchor: "middle", weight: 600 })
      .fill("#172033")
      .center(vertex.labelPosition.x, vertex.labelPosition.y);
  });

  const editable = routedEdges.find((route) => route.edge.id === options.selectedEdgeId);
  if (editable && callbacks.onCurveEditCommit) {
    let controls: DiscCubicControlEdit = Object.freeze({
      control1: Object.freeze({ ...editable.geometry.control1 }),
      control2: Object.freeze({ ...editable.geometry.control2 }),
    });
    const anchors = [editable.start, editable.end] as const;
    const positions = () => [controls.control1, controls.control2] as const;
    const initial = positions();
    const guides = [
      editorGroup.line(anchors[0].x, anchors[0].y, initial[0].x, initial[0].y),
      editorGroup.line(anchors[1].x, anchors[1].y, initial[1].x, initial[1].y),
    ];
    guides.forEach((guide) => guide.stroke({ color: "#6b7280", width: 1.5, dasharray: "6 5" }).attr({ "vector-effect": "non-scaling-stroke" }));
    const hitHandles = initial.map((position, index) => editorGroup.circle(18).center(position.x, position.y)
      .fill("none").stroke({ color: "#0f766e", width: 32, opacity: 0.001 })
      .addClass("curve-control-hit-target")
      .attr({ "aria-hidden": "true", "data-control-hit-index": String(index + 1), "vector-effect": "non-scaling-stroke", "pointer-events": "stroke" }));
    const handles = initial.map((position, index) => editorGroup.circle(18).center(position.x, position.y)
      .fill("#fffdf9").stroke({ color: "#0f766e", width: 3 })
      .addClass("curve-control-handle")
      .attr({
        "data-control-index": String(index + 1),
        role: "button",
        tabindex: 0,
        "aria-keyshortcuts": "ArrowLeft ArrowRight ArrowUp ArrowDown",
        "aria-label": `Bézier control ${index + 1} for edge ${editable.edge.start} to ${editable.edge.end}; drag it, or use arrow keys to move it`,
      }));
    const selectedPath = draw.node.querySelector<SVGPathElement>(`[data-edge-id="${editable.edge.id}"]`);
    const fillPath = draw.node.querySelector<SVGPathElement>(`[data-cycle-fill="${editable.edge.cycleIndex}"]`);

    const preview = (): void => {
      const geometry = createDiscArcFromControls(
        editable.start,
        editable.end,
        controls.control1,
        controls.control2,
        editable.geometry.depth,
      );
      selectedPath?.setAttribute("d", geometry.path);
      if (fillPath) {
        const paths = routedEdges
          .filter(({ edge }) => edge.cycleIndex === editable.edge.cycleIndex)
          .map((route) => route.edge.id === editable.edge.id ? geometry.path : route.geometry.path);
        fillPath.setAttribute("d", closedCyclePath(paths));
      }
      const nextPositions = positions();
      handles.forEach((handle, index) => handle.center((nextPositions[index] as Point).x, (nextPositions[index] as Point).y));
      hitHandles.forEach((handle, index) => handle.center((nextPositions[index] as Point).x, (nextPositions[index] as Point).y));
      guides[0]?.plot(anchors[0].x, anchors[0].y, nextPositions[0].x, nextPositions[0].y);
      guides[1]?.plot(anchors[1].x, anchors[1].y, nextPositions[1].x, nextPositions[1].y);
    };

    handles.forEach((handle, index) => {
      let dragging = false;
      let moved = false;
      const moveTo = (point: Point): boolean => {
        const next = clampToDisc(point);
        const current = index === 0 ? controls.control1 : controls.control2;
        if (Math.abs(next.x - current.x) <= 1e-12 && Math.abs(next.y - current.y) <= 1e-12) return false;
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
          callbacks.onCurvePreviewChange?.(true);
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
          callbacks.onCurvePreviewChange?.(false);
          if (moved) callbacks.onCurveEditCommit?.(editable.edge.id, controls, (index + 1) as 1 | 2);
        });
        const cancel = (): void => {
          if (!dragging) return;
          dragging = false; editorGroup.removeClass("is-dragging");
          callbacks.onCurvePreviewChange?.(false);
          callbacks.onCurveEditCancel?.((index + 1) as 1 | 2);
        };
        pointerTarget.addEventListener("pointercancel", cancel);
        pointerTarget.addEventListener("lostpointercapture", cancel);
      }
      handle.node.addEventListener("keydown", (event) => {
        const step = event.shiftKey ? 8 : 2;
        const current = index === 0 ? controls.control1 : controls.control2;
        let next = current;
        if (event.key === "ArrowLeft") next = { x: current.x - step, y: current.y };
        else if (event.key === "ArrowRight") next = { x: current.x + step, y: current.y };
        else if (event.key === "ArrowUp") next = { x: current.x, y: current.y - step };
        else if (event.key === "ArrowDown") next = { x: current.x, y: current.y + step };
        else return;
        event.preventDefault(); event.stopPropagation();
        if (moveTo(next)) callbacks.onCurveEditCommit?.(editable.edge.id, controls, (index + 1) as 1 | 2);
      });
    });
  }

  renderCaption(draw, example.notation, options.numberFont ?? "'Newsreader Variable', Georgia, serif");

  return { svg: draw.node, edges: layout.edges };
}
