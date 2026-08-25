import "./style.css";
import type { DirectedEdge } from "./geometry/disc";
import type { AnnularDirectedEdge } from "./geometry/annular-routing";
import { krewerasComplement, mathErrorMessage, parseNoncrossingPartition, partitionToString, type DiscPartition } from "./math";
import { processAnnularInput } from "./production/annularController";
import { ProductionSurfaceState, type SurfaceMode } from "./production/surfaceState";
import { annularDiagram } from "./renderer/annularModel";
import { renderAnnularDiagram } from "./renderer/annularSvgRenderer";
import { downloadSvg } from "./renderer/export";
import { partitionDiagram } from "./renderer/model";
import { renderDiagram } from "./renderer/svgRenderer";
import { ANNULAR_EXAMPLES, EXAMPLES, getAnnularExample, getExample } from "./ui/examples";

type DiscDisplayMode = "partition" | "kreweras";
type SelectedEdge = { readonly surface: "disc"; readonly edge: DirectedEdge } | { readonly surface: "annular"; readonly edge: AnnularDirectedEdge } | null;

const figure = requireElement<HTMLDivElement>("figure");
const exampleSelect = requireElement<HTMLSelectElement>("example-select");
const directionToggle = requireElement<HTMLInputElement>("direction-toggle");
const ribbonFillToggle = requireElement<HTMLInputElement>("ribbon-fill-toggle");
const cycleWidth = requireElement<HTMLInputElement>("cycle-edge-thickness");
const cycleWidthOutput = requireElement<HTMLOutputElement>("cycle-edge-thickness-output");
const outerWidth = requireElement<HTMLInputElement>("outer-boundary-thickness");
const outerWidthOutput = requireElement<HTMLOutputElement>("outer-boundary-thickness-output");
const innerWidth = requireElement<HTMLInputElement>("inner-boundary-thickness");
const innerWidthOutput = requireElement<HTMLOutputElement>("inner-boundary-thickness-output");
const innerWidthControl = requireElement<HTMLLabelElement>("inner-boundary-control");
const exportButton = requireElement<HTMLButtonElement>("export-button");
const clearButton = requireElement<HTMLButtonElement>("clear-button");
const selectionOutput = requireElement<HTMLOutputElement>("selection-output");
const discForm = requireElement<HTMLFormElement>("disc-form");
const discInput = requireElement<HTMLInputElement>("disc-input");
const discMessage = requireElement<HTMLParagraphElement>("disc-message");
const discControls = requireElement<HTMLDivElement>("disc-controls");
const annularForm = requireElement<HTMLFormElement>("annular-form");
const annularP = requireElement<HTMLInputElement>("annular-p");
const annularQ = requireElement<HTMLInputElement>("annular-q");
const annularInput = requireElement<HTMLInputElement>("annular-input");
const annularMessage = requireElement<HTMLParagraphElement>("annular-message");
const annularControls = requireElement<HTMLDivElement>("annular-controls");
const surfaceControls = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="surface-mode"]'));
const discDisplayControls = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="disc-display-mode"]'));

let discDisplayMode: DiscDisplayMode = "partition";
const state = new ProductionSurfaceState(
  requiredDiscPartition(getExample("two-cycle").notation),
  requiredAnnularState(getAnnularExample("through-two-cycle")),
);
let selectedEdge: SelectedEdge = null;
let currentSvg: SVGSVGElement | null = null;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element as T;
}

function requiredDiscPartition(input: string): DiscPartition {
  const result = parseNoncrossingPartition(input);
  if (!result.ok) throw new Error(`Invalid built-in disc example: ${result.error.kind}`);
  return result.value;
}

function requiredAnnularState(example: { p: number; q: number; notation: string }) {
  const result = processAnnularInput(String(example.p), String(example.q), example.notation);
  if (!result.ok) throw new Error(`Invalid built-in annular example: ${result.error.kind}`);
  return result;
}

function displayedDiscPartition(): DiscPartition {
  return discDisplayMode === "partition" ? state.discPartition : krewerasComplement(state.discPartition);
}

function updateSelection(edge: SelectedEdge): void {
  if (!edge) selectionOutput.value = "No edge selected";
  else if (edge.surface === "disc") {
    const value = edge.edge;
    selectionOutput.value = `cycle: (${value.cycle.join(" ")}) · edge: ${value.start} → ${value.end} · role: ${value.role}`;
  } else {
    const value = edge.edge;
    const cycle = state.annular.routed.corridors[value.cycleIndex];
    const kind = cycle?.kind === "outer-collar" ? "outer" : cycle?.kind === "inner-collar" ? "inner" : "through";
    selectionOutput.value = `cycle: (${cycle?.cycle.join(" ") ?? ""}) · edge: ${value.startLabel} → ${value.endLabel} · cycle kind: ${kind} · role: ${value.role}`;
  }
  clearButton.disabled = edge === null;
}

function redraw(): void {
  if (state.mode === "disc") {
    const rendered = renderDiagram(figure, partitionDiagram(displayedDiscPartition()), {
      showDirection: directionToggle.checked,
      showRibbonFill: ribbonFillToggle.checked,
      selectedEdgeId: selectedEdge?.surface === "disc" ? selectedEdge.edge.id : null,
      cycleEdgeWidth: Number(cycleWidth.value), outerBoundaryWidth: Number(outerWidth.value),
    }, { onSelect: (edge) => { selectedEdge = { surface: "disc", edge }; updateSelection(selectedEdge); redraw(); } });
    currentSvg = rendered.svg;
    const prefix = discDisplayMode === "partition" ? "π" : "Kr(π)";
    discMessage.dataset.state = "valid";
    discMessage.textContent = `${prefix} = ${partitionToString(displayedDiscPartition())}`;
  } else {
    const rendered = renderAnnularDiagram(figure, annularDiagram(state.annular.permutation, state.annular.routed), {
      showDirection: directionToggle.checked,
      showRibbonFill: ribbonFillToggle.checked,
      selectedEdgeId: selectedEdge?.surface === "annular" ? selectedEdge.edge.id : null,
      cycleEdgeWidth: Number(cycleWidth.value), outerBoundaryWidth: Number(outerWidth.value), innerBoundaryWidth: Number(innerWidth.value),
    }, { onSelect: (edge) => { selectedEdge = { surface: "annular", edge }; updateSelection(selectedEdge); redraw(); } });
    currentSvg = rendered.svg;
    annularMessage.dataset.state = "valid";
    annularMessage.textContent = `τ = ${state.annular.canonicalNotation} · (p,q)=(${state.annular.permutation.p},${state.annular.permutation.q})`;
  }
}

function acceptDiscInput(input: string): boolean {
  const result = parseNoncrossingPartition(input);
  if (!result.ok) { discMessage.dataset.state = "error"; discMessage.textContent = mathErrorMessage(result.error); return false; }
  state.discPartition = result.value;
  discInput.value = partitionToString(state.discPartition);
  selectedEdge = null; updateSelection(null); redraw(); return true;
}

function acceptAnnularInput(p: string, q: string, input: string): boolean {
  const result = processAnnularInput(p, q, input);
  if (!result.ok) { annularMessage.dataset.state = "error"; annularMessage.textContent = result.error.message; return false; }
  state.annular = result;
  annularP.value = String(result.permutation.p); annularQ.value = String(result.permutation.q); annularInput.value = result.canonicalNotation;
  selectedEdge = null; updateSelection(null); redraw(); return true;
}

function populateExamples(): void {
  exampleSelect.replaceChildren();
  const examples: readonly { id: string; label: string }[] = state.mode === "disc" ? EXAMPLES : ANNULAR_EXAMPLES;
  examples.forEach((example) => exampleSelect.add(new Option(example.label, example.id)));
  exampleSelect.value = state.mode === "disc" ? "two-cycle" : "through-two-cycle";
}

function showSurface(mode: SurfaceMode): void {
  state.switchTo(mode); selectedEdge = null; updateSelection(null);
  discControls.hidden = mode !== "disc"; annularControls.hidden = mode !== "annular"; innerWidthControl.hidden = mode !== "annular";
  populateExamples(); redraw();
}

exampleSelect.addEventListener("change", () => {
  if (state.mode === "disc") { const example = getExample(exampleSelect.value); discInput.value = example.notation; acceptDiscInput(example.notation); }
  else { const example = getAnnularExample(exampleSelect.value); annularP.value = String(example.p); annularQ.value = String(example.q); annularInput.value = example.notation; acceptAnnularInput(String(example.p), String(example.q), example.notation); }
});
discForm.addEventListener("submit", (event) => { event.preventDefault(); acceptDiscInput(discInput.value); });
annularForm.addEventListener("submit", (event) => { event.preventDefault(); acceptAnnularInput(annularP.value, annularQ.value, annularInput.value); });
surfaceControls.forEach((control) => control.addEventListener("change", () => { if (control.checked) showSurface(control.value as SurfaceMode); }));
discDisplayControls.forEach((control) => control.addEventListener("change", () => { if (control.checked) { discDisplayMode = control.value as DiscDisplayMode; selectedEdge = null; updateSelection(null); redraw(); } }));
directionToggle.addEventListener("change", redraw);
ribbonFillToggle.addEventListener("change", redraw);
for (const [control, output] of [[cycleWidth, cycleWidthOutput], [outerWidth, outerWidthOutput], [innerWidth, innerWidthOutput]] as const) {
  control.addEventListener("input", () => { output.value = control.value; redraw(); });
}
clearButton.addEventListener("click", () => { selectedEdge = null; updateSelection(null); redraw(); });
exportButton.addEventListener("click", () => {
  if (!currentSvg) return;
  const filename = state.mode === "disc" ? `disc-partition-n${state.discPartition.n}.svg` : `annular-permutation-p${state.annular.permutation.p}-q${state.annular.permutation.q}.svg`;
  downloadSvg(currentSvg, filename);
});

discInput.value = partitionToString(state.discPartition);
annularP.value = String(state.annular.permutation.p); annularQ.value = String(state.annular.permutation.q); annularInput.value = state.annular.canonicalNotation;
updateSelection(null); showSurface("disc");
