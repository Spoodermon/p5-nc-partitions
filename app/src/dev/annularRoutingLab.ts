import { SVG, type Svg } from "@svgdotjs/svg.js";
import { ANNULAR_VIEWBOX_SIZE, coverRadius, pointAtPolar, type AnnularRoute, type Point, type Vector } from "../geometry/annular";
import { INNER_COLLAR_CEILING, OUTER_COLLAR_FLOOR, routeAnnularPermutation, type RoutedAnnularSuccess } from "../geometry/annular-routing";
import { parseAnnularPermutation } from "../math";
import "./annularRoutingLab.css";

interface Fixture { readonly name: string; readonly p: number; readonly q: number; readonly cycles: string; }

const fixtures: readonly Fixture[] = [
  { name: "Direct through regression — attachment at 2 (former blocker)", p: 1, q: 4, cycles: "(1 2)(3 4 5)" },
  { name: "Direct through regression — attachment at 3", p: 1, q: 4, cycles: "(1 3)(2 4 5)" },
  { name: "Direct through regression — attachment at 4", p: 1, q: 4, cycles: "(1 4)(2 3 5)" },
  { name: "Former blocker — attachment at 5", p: 1, q: 4, cycles: "(1 5)(2 3 4)" },
  { name: "(1,1) identity", p: 1, q: 1, cycles: "(1)(2)" },
  { name: "(1,1) through transposition", p: 1, q: 1, cycles: "(1 2)" },
  { name: "(2,2) connected representative", p: 2, q: 2, cycles: "(1 3 2)(4)" },
  { name: "Outer two-cycle", p: 3, q: 2, cycles: "(1 2)(3)(4)(5)" },
  { name: "Inner two-cycle", p: 3, q: 2, cycles: "(1)(2)(3)(4 5)" },
  { name: "Through two-cycle", p: 3, q: 2, cycles: "(1 4)(2)(3)(5)" },
  { name: "Disconnected nontrivial", p: 4, q: 3, cycles: "(1 2 3 4)(5 6 7)" },
  { name: "Mingo–Nica (5,3)", p: 5, q: 3, cycles: "(1 8)(2)(3 4 7)(5 6)" },
  { name: "Dense connected (3,3)", p: 3, q: 3, cycles: "(1 2)(3 4 5 6)" },
  { name: "Dense with singleton", p: 4, q: 3, cycles: "(1)(2 3)(4 5 6 7)" },
];

const palette = ["#285f6b", "#9a552d", "#62549a", "#347653", "#a33f56", "#80651f"] as const;
function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing routing lab control: ${selector}`);
  return element;
}
const container = required<HTMLDivElement>("#annular-routing-lab");
const selector = required<HTMLSelectElement>("#fixture");
const directionToggle = required<HTMLInputElement>("#directions");
const ribbonFillToggle = required<HTMLInputElement>("#ribbon-fill");
const diagnosticToggle = required<HTMLInputElement>("#diagnostics");
const summary = required<HTMLDivElement>("#summary");

fixtures.forEach((fixture, index) => selector.add(new Option(fixture.name, String(index))));

function format(value: number): string { return Number(value.toFixed(3)).toString(); }
function sampledPath(route: AnnularRoute): string {
  return Array.from({ length: 161 }, (_, index) => route.pointAt(index / 160))
    .map((point, index) => `${index === 0 ? "M" : "L"} ${format(point.x)} ${format(point.y)}`).join(" ");
}
function arrowPath(point: Point, tangent: Vector): string {
  const length = Math.hypot(tangent.x, tangent.y);
  const unit = { x: tangent.x / length, y: tangent.y / length };
  const normal = { x: -unit.y, y: unit.x };
  return `M ${format(point.x + unit.x * 10)} ${format(point.y + unit.y * 10)} L ${format(point.x - unit.x * 7 + normal.x * 5)} ${format(point.y - unit.y * 7 + normal.y * 5)} L ${format(point.x - unit.x * 7 - normal.x * 5)} ${format(point.y - unit.y * 7 - normal.y * 5)} Z`;
}
function ribbonPath(forward: AnnularRoute, returning: AnnularRoute): string {
  const points = [
    ...Array.from({ length: 81 }, (_, index) => forward.pointAt(index / 80)),
    ...Array.from({ length: 81 }, (_, index) => returning.pointAt(index / 80)),
  ];
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${format(point.x)} ${format(point.y)}`).join(" ")} Z`;
}
function drawDiagram(draw: Svg, result: RoutedAnnularSuccess): void {
  const { layout } = result;
  draw.circle(layout.outerRadius * 2).center(500, 500).fill("#fffdf9").stroke({ color: "#aeb9c0", width: 2.2 });
  draw.circle(layout.innerRadius * 2).center(500, 500).fill("#edf1f3").stroke({ color: "#aeb9c0", width: 2.2 });
  if (ribbonFillToggle.checked) {
    const cycleIndices = [...new Set(result.routes
      .filter((candidate) => candidate.edge.cycleLength === 2 && candidate.edge.startBoundary === candidate.edge.endBoundary)
      .map((candidate) => candidate.edge.cycleIndex))];
    for (const cycleIndex of cycleIndices) {
      const forward = result.routes.find((candidate) => candidate.edge.cycleIndex === cycleIndex && candidate.edge.role === "forward");
      const returning = result.routes.find((candidate) => candidate.edge.cycleIndex === cycleIndex && candidate.edge.role === "return");
      if (!forward || !returning) continue;
      draw.path(ribbonPath(forward.route, returning.route)).fill(palette[cycleIndex % palette.length] as string).opacity(0.14).stroke("none");
    }
  }
  if (diagnosticToggle.checked) {
    for (const [u, color] of [[OUTER_COLLAR_FLOOR, "#285f6b"], [INNER_COLLAR_CEILING, "#9a552d"]] as const) {
      draw.circle(coverRadius(layout, u) * 2).center(500, 500).fill("none").stroke({ color, width: 1, dasharray: "7 8", opacity: 0.32 });
    }
    const seamAngle = (boundary: "outer" | "inner", seam: number): number => {
      const positions = boundary === "outer" ? result.layout.vertices.slice(0, result.layout.p) : result.layout.vertices.slice(result.layout.p);
      const next = positions[(seam + 1) % positions.length];
      const direction = boundary === "outer" ? 1 : -1;
      return (next?.angle ?? 0) - direction * Math.PI / positions.length;
    };
    for (const [angle, color] of [[seamAngle("outer", result.outerSeam), "#285f6b"], [seamAngle("inner", result.innerSeam), "#9a552d"]] as const) {
      const inner = pointAtPolar(layout.center, layout.innerRadius, angle);
      const outer = pointAtPolar(layout.center, layout.outerRadius, angle);
      draw.line(inner.x, inner.y, outer.x, outer.y).stroke({ color, width: 1.2, dasharray: "4 7", opacity: 0.45 });
    }
  }
  result.routes.forEach((candidate) => {
    const color = palette[candidate.edge.cycleIndex % palette.length] as string;
    draw.path(sampledPath(candidate.route)).fill("none").stroke({ color, width: 3.4, linecap: "round", linejoin: "round" });
    if (directionToggle.checked) draw.path(arrowPath(candidate.route.pointAt(0.5), candidate.route.tangentAt(0.5))).fill(color);
    if (diagnosticToggle.checked) {
      const point = candidate.route.pointAt(0.56);
      const corridor = result.corridors[candidate.edge.cycleIndex]?.kind ?? "?";
      const angular = candidate.principalWinding === undefined
        ? ""
        : ` k${candidate.winding}/p${candidate.principalWinding} Δ${format(Math.abs(candidate.route.angularDisplacement))}/${format(Math.abs(candidate.principalAngularDisplacement ?? 0))} ℓ${format(candidate.routeLength ?? 0)}`;
      draw.text(`${candidate.edge.startLabel}→${candidate.edge.endLabel} ${corridor}${angular} L${candidate.lane} β${format(candidate.angularBias)}`)
        .font({ family: "ui-monospace, monospace", size: 11, anchor: "middle" }).fill("#374858").center(point.x, point.y - 13);
    }
  });
  layout.vertices.forEach((vertex) => {
    const color = vertex.boundary === "outer" ? "#285f6b" : "#9a552d";
    draw.circle(15).center(vertex.boundaryPoint.x, vertex.boundaryPoint.y).fill(color).stroke({ color: "white", width: 2 });
    draw.text(String(vertex.label)).font({ family: "Georgia, serif", size: 24, weight: 600, anchor: "middle" }).fill("#192333").center(vertex.labelPoint.x, vertex.labelPoint.y);
  });
  draw.text(`δ* = ${format(result.phase)} rad`).font({ family: "Georgia, serif", size: 18, anchor: "middle" }).fill("#607080").center(500, 968);
  if (diagnosticToggle.checked && result.diagnostics.worstPair) {
    const worst = result.diagnostics.worstPair;
    draw.text(`minimum pair: ${worst.firstEdgeId} / ${worst.secondEdgeId}`)
      .font({ family: "ui-monospace, monospace", size: 11, anchor: "middle" }).fill("#9c2d2d").center(500, 35);
  }
}

function render(): void {
  const fixture = fixtures[Number(selector.value)] ?? fixtures[0] as Fixture;
  const parsed = parseAnnularPermutation(fixture.cycles, fixture.p, fixture.q);
  if (!parsed.ok) throw new Error(`Invalid lab fixture ${fixture.name}: ${parsed.error.kind}`);
  const result = routeAnnularPermutation(parsed.value);
  container.replaceChildren();
  const draw = SVG().addTo(container).size("100%", "100%").viewbox(0, 0, ANNULAR_VIEWBOX_SIZE, ANNULAR_VIEWBOX_SIZE);
  draw.attr({ role: "img", "aria-label": `Routed ${fixture.name}`, preserveAspectRatio: "xMidYMid meet" });
  if (!result.isRoutable) {
    draw.text(`Routing failed: ${result.reason}`).font({ size: 28, anchor: "middle" }).fill("#9c2d2d").center(500, 500);
    summary.textContent = `${fixture.cycles} · ${result.reason}`;
    summary.classList.add("error");
    return;
  }
  summary.classList.remove("error");
  drawDiagram(draw, result);
  const clearance = Number.isFinite(result.diagnostics.minimumClearance) ? format(result.diagnostics.minimumClearance) : "∞";
  const corridors = result.corridors.map((corridor) => `(${corridor.cycle.join(" ")})=${corridor.kind}`).join(", ");
  const homotopy = result.diagnostics.principalThroughFallbackUsed ? "non-principal fallback proven necessary" : "principal through homotopy";
  summary.textContent = `${fixture.cycles} · phase ${format(result.phase)} · seams O${result.outerSeam}/I${result.innerSeam} · ${corridors} · ${homotopy} · ${result.routes.length} edges · hard collisions ${result.diagnostics.hardCollisionCount} · minimum clearance ${clearance} · ${format(result.diagnostics.elapsedMilliseconds)} ms · ${result.diagnostics.searchNodes} nodes`;
}

[selector, directionToggle, ribbonFillToggle, diagnosticToggle].forEach((control) => control.addEventListener("change", render));
render();
