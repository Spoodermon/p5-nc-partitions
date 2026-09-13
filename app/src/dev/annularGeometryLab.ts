import { SVG, type Svg } from "@svgdotjs/svg.js";
import {
  ANNULAR_VIEWBOX_SIZE,
  createAnnularLayout,
  createAnnularRoute,
  sampleAnnularRoute,
  type AnnularRoute,
  type Point,
  type Vector,
} from "../geometry/annular";
import "./annularGeometryLab.css";

interface RouteFixture {
  readonly name: string;
  readonly route: AnnularRoute;
  readonly color: string;
  readonly width: number;
  readonly dasharray?: string;
}

const container = document.querySelector<HTMLDivElement>("#annular-lab");
if (!container) throw new Error("Missing annular geometry laboratory container");

const layout = createAnnularLayout(8, 5);
const fixtures: readonly RouteFixture[] = [
  {
    name: "outer shallow",
    route: createAnnularRoute(layout, { startLabel: 1, endLabel: 3, excursion: 0.2, angularBias: 0.04 }),
    color: "#176b75",
    width: 3.2,
  },
  {
    name: "outer deep return",
    route: createAnnularRoute(layout, { startLabel: 3, endLabel: 1, excursion: 0.46, angularBias: -0.08 }),
    color: "#176b75",
    width: 4.2,
  },
  {
    name: "inner shallow",
    route: createAnnularRoute(layout, { startLabel: 9, endLabel: 11, excursion: 0.22, angularBias: 0.04 }),
    color: "#9a4f22",
    width: 3.2,
  },
  {
    name: "inner deep return",
    route: createAnnularRoute(layout, { startLabel: 11, endLabel: 9, excursion: 0.48, angularBias: -0.08 }),
    color: "#9a4f22",
    width: 4.2,
  },
  {
    name: "outer to inner",
    route: createAnnularRoute(layout, { startLabel: 4, endLabel: 11, angularBias: 0.22 }),
    color: "#5b4b99",
    width: 3.5,
  },
  {
    name: "inner to outer opposite bias",
    route: createAnnularRoute(layout, { startLabel: 11, endLabel: 4, angularBias: -0.22 }),
    color: "#5b4b99",
    width: 3.5,
  },
  {
    name: "outer singleton",
    route: createAnnularRoute(layout, { startLabel: 6, endLabel: 6, excursion: 0.11, angularBias: 0.18 }),
    color: "#28784d",
    width: 3.2,
  },
  {
    name: "inner singleton",
    route: createAnnularRoute(layout, { startLabel: 12, endLabel: 12, excursion: 0.14, angularBias: -0.2 }),
    color: "#28784d",
    width: 3.2,
  },
  {
    name: "lift 0",
    route: createAnnularRoute(layout, { startLabel: 2, endLabel: 10, winding: 0, angularBias: 0.06 }),
    color: "#b45309",
    width: 2.5,
    dasharray: "7 8",
  },
  {
    name: "lift 1",
    route: createAnnularRoute(layout, { startLabel: 2, endLabel: 10, winding: 1, angularBias: 0.06 }),
    color: "#b45309",
    width: 2.5,
    dasharray: "2 8",
  },
];

function format(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function sampledPath(route: AnnularRoute): string {
  return sampleAnnularRoute(route, 241)
    .map((point, index) => `${index === 0 ? "M" : "L"} ${format(point.x)} ${format(point.y)}`)
    .join(" ");
}

function arrowPath(point: Point, tangent: Vector): string {
  const length = Math.hypot(tangent.x, tangent.y);
  const direction = { x: tangent.x / length, y: tangent.y / length };
  const normal = { x: -direction.y, y: direction.x };
  const tip = { x: point.x + direction.x * 9, y: point.y + direction.y * 9 };
  const left = { x: point.x - direction.x * 7 + normal.x * 5, y: point.y - direction.y * 7 + normal.y * 5 };
  const right = { x: point.x - direction.x * 7 - normal.x * 5, y: point.y - direction.y * 7 - normal.y * 5 };
  return `M ${format(tip.x)} ${format(tip.y)} L ${format(left.x)} ${format(left.y)} L ${format(right.x)} ${format(right.y)} Z`;
}

function drawRoute(draw: Svg, fixture: RouteFixture): void {
  const path = draw
    .path(sampledPath(fixture.route))
    .fill("none")
    .stroke({ color: fixture.color, width: fixture.width, linecap: "round", linejoin: "round" })
    .attr({
      "data-route-kind": fixture.route.kind,
      "data-route-name": fixture.name,
      "data-winding": fixture.route.winding,
      "data-angular-bias": fixture.route.angularBias,
    });
  if (fixture.dasharray) path.attr({ "stroke-dasharray": fixture.dasharray });

  const midpoint = fixture.route.pointAt(0.5);
  const tangent = fixture.route.tangentAt(0.5);
  draw.path(arrowPath(midpoint, tangent)).fill(fixture.color).attr({ "data-direction-for": fixture.name });
}

const draw = SVG().addTo(container).size("100%", "100%").viewbox(0, 0, ANNULAR_VIEWBOX_SIZE, ANNULAR_VIEWBOX_SIZE);
draw.attr({
  "aria-label": "Annular geometry route laboratory",
  preserveAspectRatio: "xMidYMid meet",
  role: "img",
});

draw
  .circle(layout.outerRadius * 2)
  .center(layout.center.x, layout.center.y)
  .fill("#fffdf9")
  .stroke({ color: "#a8b2bd", width: 2.5 });
draw
  .circle(layout.innerRadius * 2)
  .center(layout.center.x, layout.center.y)
  .fill("#eef1f4")
  .stroke({ color: "#a8b2bd", width: 2.5 });

fixtures.forEach((fixture) => drawRoute(draw, fixture));

layout.vertices.forEach((vertex) => {
  const color = vertex.boundary === "outer" ? "#176b75" : "#9a4f22";
  draw.circle(16).center(vertex.boundaryPoint.x, vertex.boundaryPoint.y).fill(color).stroke({ color: "#ffffff", width: 2.2 });
  draw
    .text(String(vertex.label))
    .font({ family: "Georgia, 'Times New Roman', serif", size: 25, anchor: "middle", weight: 600 })
    .fill("#172033")
    .center(vertex.labelPoint.x, vertex.labelPoint.y);
});

draw
  .text(`δ₀ = π / lcm(8,5) = π / 40`)
  .font({ family: "Georgia, 'Times New Roman', serif", size: 19, anchor: "middle" })
  .fill("#52606e")
  .center(layout.center.x, 968);
