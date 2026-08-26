import "./style.css";
import type { DirectedEdge } from "./geometry/disc";
import { routeAnnularPermutation, type AnnularDirectedEdge } from "./geometry/annular-routing";
import { annularKrewerasComplement, annularPermutationToString, classifiedAnnularCycles, krewerasComplement, mathErrorMessage, parseNoncrossingPartition, partitionToString, randomAnnularBlockNotation, randomNoncrossingPartition, type DiscPartition } from "./math";
import { processAnnularInput, type AcceptedAnnularInput } from "./production/annularController";
import { ProductionSurfaceState, type SurfaceMode } from "./production/surfaceState";
import { annularDiagram } from "./renderer/annularModel";
import { renderAnnularDiagram } from "./renderer/annularSvgRenderer";
import { downloadSvg } from "./renderer/export";
import { partitionDiagram } from "./renderer/model";
import { renderDiagram } from "./renderer/svgRenderer";
import { DEFAULT_CYCLE_COLOR, NAMED_PALETTES, paletteById } from "./renderer/colors";
import { ANNULAR_EXAMPLES, EXAMPLES, getAnnularExample, getExample } from "./ui/examples";

type DiscDisplayMode = "partition" | "kreweras";
type AnnularDisplayMode = "permutation" | "kreweras";
type ColorMode = "palette" | "single" | "kind" | "custom";
type SelectedEdge = { readonly surface: "disc"; readonly edge: DirectedEdge } | { readonly surface: "annular"; readonly edge: AnnularDirectedEdge } | null;

const figure = requireElement<HTMLDivElement>("figure");
const figureShell = requireElement<HTMLDivElement>("figure-shell");
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
const discN = requireElement<HTMLInputElement>("disc-n");
const discInput = requireElement<HTMLInputElement>("disc-input");
const discRandomButton = requireElement<HTMLButtonElement>("disc-random-button");
const discMessage = requireElement<HTMLParagraphElement>("disc-message");
const discControls = requireElement<HTMLDivElement>("disc-controls");
const annularForm = requireElement<HTMLFormElement>("annular-form");
const annularP = requireElement<HTMLInputElement>("annular-p");
const annularQ = requireElement<HTMLInputElement>("annular-q");
const annularInput = requireElement<HTMLInputElement>("annular-input");
const annularRandomButton = requireElement<HTMLButtonElement>("annular-random-button");
const annularMessage = requireElement<HTMLParagraphElement>("annular-message");
const annularControls = requireElement<HTMLDivElement>("annular-controls");
const routingProgress = requireElement<HTMLDivElement>("routing-progress");
const routingProgressLabel = requireElement<HTMLSpanElement>("routing-progress-label");
const colorModeControl = requireElement<HTMLSelectElement>("color-mode");
const paletteOptions = requireElement<HTMLDivElement>("palette-options");
const singleColorControl = requireElement<HTMLLabelElement>("single-color-control");
const singleColor = requireElement<HTMLInputElement>("single-color");
const kindColorControls = requireElement<HTMLDivElement>("kind-color-controls");
const outerCycleColor = requireElement<HTMLInputElement>("outer-cycle-color");
const innerCycleColor = requireElement<HTMLInputElement>("inner-cycle-color");
const throughCycleColor = requireElement<HTMLInputElement>("through-cycle-color");
const cycleColorControls = requireElement<HTMLDivElement>("cycle-color-controls");
const numberFontControl = requireElement<HTMLSelectElement>("number-font");
const surfaceControls = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="surface-mode"]'));
const discDisplayControls = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="disc-display-mode"]'));
const annularDisplayControls = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="annular-display-mode"]'));

let discDisplayMode: DiscDisplayMode = "partition";
let annularDisplayMode: AnnularDisplayMode = "permutation";
let annularComplementState: AcceptedAnnularInput | null = null;
let selectedPalette = "tidepool";
const customColors = new Map<string, string>();
const annularComplementCache = new Map<string, AcceptedAnnularInput>();
const NUMBER_FONTS: Readonly<Record<string, string>> = Object.freeze({
  Newsreader: "Newsreader, Georgia, 'Times New Roman', serif",
  Geist: "Geist, ui-sans-serif, system-ui, sans-serif",
  "Geist Mono": "'Geist Mono', ui-monospace, monospace",
});
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

function displayedAnnularState(): AcceptedAnnularInput {
  return annularDisplayMode === "kreweras" && annularComplementState ? annularComplementState : state.annular;
}

function selectedNumberFont(): string { return NUMBER_FONTS[numberFontControl.value] ?? NUMBER_FONTS.Newsreader as string; }
function annularCacheKey(value: AcceptedAnnularInput): string { return `${value.permutation.p},${value.permutation.q}:${value.canonicalNotation}`; }

function cycleDescriptors(): readonly { notation: string; kind: "outer" | "inner" | "through" }[] {
  if (state.mode === "disc") {
    return partitionDiagram(displayedDiscPartition()).cycles.map((cycle) => ({ notation: `(${cycle.join(" ")})`, kind: "outer" as const }));
  }
  return classifiedAnnularCycles(displayedAnnularState().permutation).map(({ cycle, kind }) => ({ notation: `(${cycle.join(" ")})`, kind }));
}

function cycleColors(): readonly string[] {
  const palette = paletteById(selectedPalette).colors;
  return cycleDescriptors().map((cycle, index) => {
    switch (colorModeControl.value as ColorMode) {
      case "single": return singleColor.value;
      case "kind": return cycle.kind === "outer" ? outerCycleColor.value : cycle.kind === "inner" ? innerCycleColor.value : throughCycleColor.value;
      case "custom": return customColors.get(cycle.notation) ?? palette[index % palette.length] ?? DEFAULT_CYCLE_COLOR;
      default: return palette[index % palette.length] ?? DEFAULT_CYCLE_COLOR;
    }
  });
}

function updateColorPanel(): void {
  const mode = colorModeControl.value as ColorMode;
  paletteOptions.hidden = mode !== "palette";
  singleColorControl.hidden = mode !== "single";
  kindColorControls.hidden = mode !== "kind" || state.mode !== "annular";
  cycleColorControls.hidden = mode !== "custom";
  cycleColorControls.replaceChildren();
  if (mode !== "custom") return;
  const palette = paletteById(selectedPalette).colors;
  cycleDescriptors().forEach((cycle, index) => {
    const label = document.createElement("label");
    label.className = "color-row"; label.append(cycle.notation);
    const input = document.createElement("input"); input.type = "color";
    input.value = customColors.get(cycle.notation) ?? palette[index % palette.length] ?? DEFAULT_CYCLE_COLOR;
    input.addEventListener("input", () => { customColors.set(cycle.notation, input.value); redraw(); });
    label.append(input); cycleColorControls.append(label);
  });
}

function updateSelection(edge: SelectedEdge): void {
  if (!edge) selectionOutput.value = "No edge selected";
  else if (edge.surface === "disc") {
    const value = edge.edge;
    selectionOutput.value = `cycle: (${value.cycle.join(" ")}) · edge: ${value.start} → ${value.end} · role: ${value.role}`;
  } else {
    const value = edge.edge;
    const cycle = displayedAnnularState().routed.corridors[value.cycleIndex];
    const kind = cycle?.kind === "outer-collar" ? "outer" : cycle?.kind === "inner-collar" ? "inner" : "through";
    selectionOutput.value = `cycle: (${cycle?.cycle.join(" ") ?? ""}) · edge: ${value.startLabel} → ${value.endLabel} · cycle kind: ${kind} · role: ${value.role}`;
  }
  clearButton.disabled = edge === null;
}

function redraw(): void {
  updateColorPanel();
  const colors = cycleColors();
  if (state.mode === "disc") {
    const rendered = renderDiagram(figure, partitionDiagram(displayedDiscPartition()), {
      showDirection: directionToggle.checked,
      showRibbonFill: ribbonFillToggle.checked,
      selectedEdgeId: selectedEdge?.surface === "disc" ? selectedEdge.edge.id : null,
      cycleEdgeWidth: Number(cycleWidth.value), outerBoundaryWidth: Number(outerWidth.value),
      cycleColors: colors,
      numberFont: selectedNumberFont(),
    }, { onSelect: (edge) => { selectedEdge = { surface: "disc", edge }; updateSelection(selectedEdge); redraw(); } });
    currentSvg = rendered.svg;
    const prefix = discDisplayMode === "partition" ? "π" : "Kr(π)";
    discMessage.dataset.state = "valid";
    discMessage.textContent = `${prefix} = ${partitionToString(displayedDiscPartition())}`;
  } else {
    const annularState = displayedAnnularState();
    const rendered = renderAnnularDiagram(figure, annularDiagram(annularState.permutation, annularState.routed), {
      showDirection: directionToggle.checked,
      showRibbonFill: ribbonFillToggle.checked,
      selectedEdgeId: selectedEdge?.surface === "annular" ? selectedEdge.edge.id : null,
      cycleEdgeWidth: Number(cycleWidth.value), outerBoundaryWidth: Number(outerWidth.value), innerBoundaryWidth: Number(innerWidth.value),
      cycleColors: colors,
      numberFont: selectedNumberFont(),
    }, { onSelect: (edge) => { selectedEdge = { surface: "annular", edge }; updateSelection(selectedEdge); redraw(); } });
    currentSvg = rendered.svg;
    annularMessage.dataset.state = "valid";
    const prefix = annularDisplayMode === "kreweras" ? "Kr(τ)" : "τ";
    annularMessage.textContent = `${prefix} = ${annularState.canonicalNotation} · (p,q)=(${annularState.permutation.p},${annularState.permutation.q})`;
  }
}

function acceptDiscInput(input: string): boolean {
  const result = parseNoncrossingPartition(input);
  if (!result.ok) { discMessage.dataset.state = "error"; discMessage.textContent = mathErrorMessage(result.error); return false; }
  state.discPartition = result.value;
  discN.value = String(result.value.n);
  discInput.value = partitionToString(state.discPartition);
  selectedEdge = null; updateSelection(null); redraw(); return true;
}

function acceptAnnularInput(p: string, q: string, input: string): boolean {
  const result = processAnnularInput(p, q, input);
  if (!result.ok) { annularMessage.dataset.state = "error"; annularMessage.textContent = result.error.message; return false; }
  state.annular = result;
  annularComplementState = annularComplementCache.get(annularCacheKey(result)) ?? null;
  annularDisplayMode = "permutation";
  annularDisplayControls.forEach((control) => { control.checked = control.value === "permutation"; });
  annularP.value = String(result.permutation.p); annularQ.value = String(result.permutation.q); annularInput.value = result.canonicalNotation;
  selectedEdge = null; updateSelection(null); redraw(); return true;
}

function queueAnnularInput(p: string, q: string, input: string, fallbackInput?: string): void {
  annularMessage.dataset.state = "pending";
  annularMessage.textContent = "Preparing annular diagram…";
  routingProgress.hidden = false;
  routingProgressLabel.textContent = "Validating boundary sizes and cycle blocks…";
  window.setTimeout(() => {
    routingProgressLabel.textContent = "Canonicalizing cycle order and searching phases, seams, and collision-free routes…";
    window.setTimeout(() => {
      const accepted = acceptAnnularInput(p, q, input);
      if (!accepted && fallbackInput) {
        routingProgressLabel.textContent = "The connected draw was too crowded; routing a fresh disconnected annular sample…";
        annularInput.value = fallbackInput;
        window.setTimeout(() => { acceptAnnularInput(p, q, fallbackInput); routingProgress.hidden = true; }, 20);
      } else routingProgress.hidden = true;
    }, 20);
  }, 20);
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
  surfaceControls.forEach((control) => { control.checked = control.value === mode; });
  populateExamples(); redraw();
}

function showAnnularComplement(): void {
  const cached = annularComplementCache.get(annularCacheKey(state.annular));
  if (cached) { annularComplementState = cached; selectedEdge = null; updateSelection(null); redraw(); return; }
  routingProgress.hidden = false;
  routingProgressLabel.textContent = "Computing Mingo–Nica annular Kreweras complement and routing its cycles…";
  window.setTimeout(() => {
    const permutation = annularKrewerasComplement(state.annular.permutation);
    const routed = routeAnnularPermutation(permutation);
    routingProgress.hidden = true;
    if (!routed.isRoutable) {
      annularDisplayMode = "permutation";
      annularDisplayControls.forEach((control) => { control.checked = control.value === "permutation"; });
      annularMessage.dataset.state = "error";
      annularMessage.textContent = "Kr(τ) is defined, but the bounded production router could not place it without a collision.";
      return;
    }
    annularComplementState = { ok: true, permutation, routed, canonicalNotation: annularPermutationToString(permutation) };
    annularComplementCache.set(annularCacheKey(state.annular), annularComplementState);
    selectedEdge = null; updateSelection(null); redraw();
  }, 20);
}

function populatePalettes(): void {
  for (const palette of NAMED_PALETTES) {
    const label = document.createElement("label"); label.className = "palette-option";
    const radio = document.createElement("input"); radio.type = "radio"; radio.name = "cycle-palette"; radio.value = palette.id; radio.checked = palette.id === selectedPalette;
    const content = document.createElement("span");
    const name = document.createElement("span"); name.textContent = palette.name;
    const strip = document.createElement("span"); strip.className = "palette-strip";
    palette.colors.forEach((color) => { const swatch = document.createElement("i"); swatch.style.backgroundColor = color; strip.append(swatch); });
    content.append(name, strip); label.append(radio, content); paletteOptions.append(label);
    radio.addEventListener("change", () => { if (radio.checked) { selectedPalette = palette.id; redraw(); } });
  }
}

exampleSelect.addEventListener("change", () => {
  if (state.mode === "disc") { const example = getExample(exampleSelect.value); discInput.value = example.notation; acceptDiscInput(example.notation); }
  else { const example = getAnnularExample(exampleSelect.value); annularP.value = String(example.p); annularQ.value = String(example.q); annularInput.value = example.notation; queueAnnularInput(String(example.p), String(example.q), example.notation); }
});
discForm.addEventListener("submit", (event) => { event.preventDefault(); acceptDiscInput(discInput.value); });
annularForm.addEventListener("submit", (event) => { event.preventDefault(); queueAnnularInput(annularP.value, annularQ.value, annularInput.value); });
discRandomButton.addEventListener("click", () => {
  const n = Number(discN.value.trim());
  if (!Number.isInteger(n) || n < 1) { discMessage.dataset.state = "error"; discMessage.textContent = "n must be a positive integer."; return; }
  const partition = randomNoncrossingPartition(n);
  discInput.value = partitionToString(partition); acceptDiscInput(discInput.value);
});
annularRandomButton.addEventListener("click", () => {
  const p = Number(annularP.value.trim()); const q = Number(annularQ.value.trim());
  if (!Number.isInteger(p) || p < 1 || !Number.isInteger(q) || q < 1) { annularMessage.dataset.state = "error"; annularMessage.textContent = "p and q must be positive integers."; return; }
  const notation = randomAnnularBlockNotation(p, q, Math.random, 0.45);
  const fallback = randomAnnularBlockNotation(p, q, Math.random, 0);
  annularInput.value = notation; queueAnnularInput(String(p), String(q), notation, fallback);
});
surfaceControls.forEach((control) => control.addEventListener("change", () => { if (control.checked) showSurface(control.value as SurfaceMode); }));
discDisplayControls.forEach((control) => control.addEventListener("change", () => { if (control.checked) { discDisplayMode = control.value as DiscDisplayMode; selectedEdge = null; updateSelection(null); redraw(); } }));
annularDisplayControls.forEach((control) => control.addEventListener("change", () => {
  if (!control.checked) return;
  annularDisplayMode = control.value as AnnularDisplayMode;
  if (annularDisplayMode === "kreweras" && !annularComplementState) showAnnularComplement();
  else { selectedEdge = null; updateSelection(null); redraw(); }
}));
directionToggle.addEventListener("change", redraw);
ribbonFillToggle.addEventListener("change", redraw);
numberFontControl.addEventListener("change", () => { document.documentElement.style.setProperty("--number-font", selectedNumberFont()); redraw(); });
[colorModeControl, singleColor, outerCycleColor, innerCycleColor, throughCycleColor].forEach((control) => control.addEventListener("input", redraw));
for (const [control, output] of [[cycleWidth, cycleWidthOutput], [outerWidth, outerWidthOutput], [innerWidth, innerWidthOutput]] as const) {
  control.addEventListener("input", () => { output.value = control.value; redraw(); });
}
clearButton.addEventListener("click", () => { selectedEdge = null; updateSelection(null); redraw(); });
exportButton.addEventListener("click", () => {
  if (!currentSvg) return;
  const filename = state.mode === "disc" ? `disc-partition-n${state.discPartition.n}.svg` : `annular-permutation-p${state.annular.permutation.p}-q${state.annular.permutation.q}.svg`;
  downloadSvg(currentSvg, filename);
});
figureShell.addEventListener("pointermove", (event) => {
  const bounds = figureShell.getBoundingClientRect();
  figureShell.classList.toggle("is-download-visible", event.clientY <= bounds.top + bounds.height / 3);
});
figureShell.addEventListener("pointerleave", () => {
  if (document.activeElement !== exportButton) figureShell.classList.remove("is-download-visible");
});
exportButton.addEventListener("focus", () => figureShell.classList.add("is-download-visible"));
exportButton.addEventListener("blur", () => figureShell.classList.remove("is-download-visible"));

discInput.value = partitionToString(state.discPartition);
discN.value = String(state.discPartition.n);
annularP.value = String(state.annular.permutation.p); annularQ.value = String(state.annular.permutation.q); annularInput.value = state.annular.canonicalNotation;
populatePalettes();
updateSelection(null); showSurface("disc");
