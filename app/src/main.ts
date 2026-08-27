import "./style.css";
import { INPUT_LIMITS, parseBoundedPositiveInteger, type BoundedPositiveIntegerError } from "./config/limits";
import type { DirectedEdge } from "./geometry/disc";
import { isEditableCoverCubic, routeAnnularPermutation, verifyAnnularRouteControlEdit, type AnnularDirectedEdge, type CoverCubicControlEdit } from "./geometry/annular-routing";
import { annularKrewerasComplement, annularPermutationToString, classifiedAnnularCycles, krewerasComplement, mathErrorMessage, parseNoncrossingPartition, partitionToString, randomNoncrossingPartition, type DiscPartition } from "./math";
import { annularResolutionMessage, annularRoutingFailureMessage, processAnnularInput, type AcceptedAnnularInput, type AnnularInputInterpretation } from "./production/annularController";
import { defaultAnnularRandomDensity, routeAwareRandomAnnularPermutation, type AnnularRandomMode } from "./production/randomAnnular";
import { ProductionSurfaceState, type SurfaceMode } from "./production/surfaceState";
import { annularDiagram } from "./renderer/annularModel";
import { renderAnnularDiagram } from "./renderer/annularSvgRenderer";
import { downloadSvg } from "./renderer/export";
import { installNumberFonts, numberFontStack } from "./renderer/fonts";
import { partitionDiagram } from "./renderer/model";
import { renderDiagram } from "./renderer/svgRenderer";
import { DEFAULT_CYCLE_COLOR, NAMED_PALETTES, paletteById } from "./renderer/colors";
import { ANNULAR_EXAMPLES, EXAMPLES, getAnnularExample, getExample } from "./ui/examples";

type DiscDisplayMode = "partition" | "kreweras";
type AnnularDisplayMode = "permutation" | "kreweras";
type ColorMode = "palette" | "single" | "kind" | "custom";
type SelectedEdge = { readonly surface: "disc"; readonly edge: DirectedEdge } | { readonly surface: "annular"; readonly edge: AnnularDirectedEdge } | null;

installNumberFonts();

function boundedIntegerErrorMessage(name: "n" | "p" | "q", reason: BoundedPositiveIntegerError, maximum: number): string {
  if (reason === "input-too-long") return `${name} is too long; the supported maximum is ${INPUT_LIMITS.numericInputCharacters} characters.`;
  if (reason === "too-large") return `This visualizer currently supports ${name} ≤ ${maximum}.`;
  if (reason === "unsafe-integer") return `${name} is outside the supported safe integer range.`;
  return `${name} is required and must be a positive decimal integer.`;
}

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
const annularRandomDistribution = requireElement<HTMLSelectElement>("annular-random-distribution");
const annularMessage = requireElement<HTMLParagraphElement>("annular-message");
const annularControls = requireElement<HTMLDivElement>("annular-controls");
const routingProgress = requireElement<HTMLDivElement>("routing-progress");
const routingProgressLabel = requireElement<HTMLSpanElement>("routing-progress-label");
const undoCurveButton = requireElement<HTMLButtonElement>("undo-curve-button");
const resetCurveButton = requireElement<HTMLButtonElement>("reset-curve-button");
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
const annularInterpretationControls = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="annular-input-interpretation"]'));

let discDisplayMode: DiscDisplayMode = "partition";
let annularDisplayMode: AnnularDisplayMode = "permutation";
let annularInputInterpretation: AnnularInputInterpretation = "strict-permutation";
let annularComplementState: AcceptedAnnularInput | null = null;
let selectedPalette = "tidepool";
const customColors = new Map<string, string>();
const annularComplementCache = new Map<string, AcceptedAnnularInput>();
const state = new ProductionSurfaceState(
  requiredDiscPartition(getExample("two-cycle").notation),
  requiredAnnularState(getAnnularExample("through-two-cycle")),
);
let selectedEdge: SelectedEdge = null;
let currentSvg: SVGSVGElement | null = null;
let annularEditBaseline: AcceptedAnnularInput = state.annular;
const annularEditHistory: AcceptedAnnularInput[] = [];
let annularStatusOverride: { readonly state: "valid" | "error"; readonly message: string } | null = null;
let annularRequestGeneration = 0;
let distributionWasExplicitlyChosen = false;
let pendingCurveControlFocus: 1 | 2 | null = null;
const CURVE_EDIT_HISTORY_LIMIT = 50;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element as T;
}

function rememberAnnularEditState(value: AcceptedAnnularInput): void {
  if (annularEditHistory.length >= CURVE_EDIT_HISTORY_LIMIT) annularEditHistory.shift();
  annularEditHistory.push(value);
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

function selectedNumberFont(): string { return numberFontStack(numberFontControl.value); }
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
  const editableCandidate = edge?.surface === "annular" && annularDisplayMode === "permutation"
    ? state.annular.routed.routes.find((candidate) => candidate.edge.id === edge.edge.id)
    : undefined;
  const canEdit = isEditableCoverCubic(editableCandidate);
  undoCurveButton.hidden = !canEdit;
  resetCurveButton.hidden = !canEdit;
  undoCurveButton.disabled = !canEdit || annularEditHistory.length === 0;
  resetCurveButton.disabled = !canEdit || state.annular === annularEditBaseline;
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
    const editingEnabled = annularDisplayMode === "permutation";
    const rendered = renderAnnularDiagram(figure, annularDiagram(annularState.permutation, annularState.routed), {
      showDirection: directionToggle.checked,
      showRibbonFill: ribbonFillToggle.checked,
      selectedEdgeId: selectedEdge?.surface === "annular" ? selectedEdge.edge.id : null,
      cycleEdgeWidth: Number(cycleWidth.value), outerBoundaryWidth: Number(outerWidth.value), innerBoundaryWidth: Number(innerWidth.value),
      cycleColors: colors,
      numberFont: selectedNumberFont(),
    }, {
      onSelect: (edge) => { selectedEdge = { surface: "annular", edge }; updateSelection(selectedEdge); redraw(); },
      onCurveEditCommit: editingEnabled ? commitAnnularCurveEdit : undefined,
      onCurveEditCancel: editingEnabled ? redraw : undefined,
    });
    currentSvg = rendered.svg;
    if (annularStatusOverride && annularDisplayMode === "permutation") {
      annularMessage.dataset.state = annularStatusOverride.state;
      annularMessage.textContent = annularStatusOverride.message;
    } else {
      annularMessage.dataset.state = "valid";
      const prefix = annularDisplayMode === "kreweras" ? "Kr(τ)" : "τ";
      annularMessage.textContent = `${annularResolutionMessage(annularState, prefix)} · (p,q)=(${annularState.permutation.p},${annularState.permutation.q})`;
    }
    if (pendingCurveControlFocus !== null) {
      currentSvg.querySelector<SVGElement>(`[data-control-index="${pendingCurveControlFocus}"]`)?.focus();
      pendingCurveControlFocus = null;
    }
  }
}

function commitAnnularCurveEdit(edgeId: string, controls: CoverCubicControlEdit, restoreFocusToControl?: 1 | 2): void {
  pendingCurveControlFocus = restoreFocusToControl ?? null;
  if (annularDisplayMode !== "permutation") { redraw(); return; }
  const edited = verifyAnnularRouteControlEdit(state.annular.routed, edgeId, controls);
  if (!edited.ok) {
    const detail = edited.reason === "self-intersection"
      ? "the curve would intersect itself"
      : edited.reason === "collision"
        ? "the curve would collide with another routed edge"
        : edited.reason === "verification-failed"
          ? "the analytical verifier could not certify that geometry within its fixed depth/segment bounds"
        : "that edge/control position is not editable";
    annularStatusOverride = { state: "error", message: `Curve change rejected: ${detail}. Restored the previous verified curve.` };
    updateSelection(selectedEdge);
    redraw();
    return;
  }
  rememberAnnularEditState(state.annular);
  state.annular = Object.freeze({ ...state.annular, routed: edited.routed });
  annularStatusOverride = { state: "valid", message: "Curve adjusted and admitted by the production collision verifier." };
  updateSelection(selectedEdge);
  redraw();
}

function acceptDiscInput(input: string): boolean {
  const result = parseNoncrossingPartition(input);
  if (!result.ok) { discMessage.dataset.state = "error"; discMessage.textContent = mathErrorMessage(result.error); return false; }
  state.discPartition = result.value;
  discN.value = String(result.value.n);
  discInput.value = partitionToString(state.discPartition);
  selectedEdge = null; updateSelection(null); syncExampleSelector(); redraw(); return true;
}

function commitAcceptedAnnularInput(
  result: AcceptedAnnularInput,
  statusOverride: { readonly state: "valid" | "error"; readonly message: string } | null = null,
): void {
  state.annular = result;
  annularEditBaseline = result;
  annularEditHistory.splice(0);
  annularStatusOverride = statusOverride;
  annularComplementState = annularComplementCache.get(annularCacheKey(result)) ?? null;
  annularDisplayMode = "permutation";
  annularDisplayControls.forEach((control) => { control.checked = control.value === "permutation"; });
  annularP.value = String(result.permutation.p); annularQ.value = String(result.permutation.q);
  syncRandomDistributionDefault();
  selectedEdge = null; updateSelection(null); syncExampleSelector(); redraw();
}

function acceptAnnularInput(p: string, q: string, input: string, interpretation: AnnularInputInterpretation = annularInputInterpretation): boolean {
  annularStatusOverride = null;
  const result = processAnnularInput(p, q, input, routeAnnularPermutation, interpretation);
  if (!result.ok) { annularMessage.dataset.state = "error"; annularMessage.textContent = result.error.message; return false; }
  commitAcceptedAnnularInput(result);
  return true;
}

function queueAnnularInput(p: string, q: string, input: string): void {
  const interpretation = annularInputInterpretation;
  const generation = ++annularRequestGeneration;
  annularMessage.dataset.state = "pending";
  annularMessage.textContent = "Routing…";
  routingProgress.hidden = false;
  routingProgressLabel.textContent = "Routing…";
  window.setTimeout(() => {
    if (generation !== annularRequestGeneration) return;
    const accepted = acceptAnnularInput(p, q, input, interpretation);
    if (generation === annularRequestGeneration) routingProgress.hidden = true;
    if (!accepted) annularStatusOverride = null;
  }, 0);
}

function syncRandomDistributionDefault(): void {
  if (distributionWasExplicitlyChosen) return;
  const parsedP = parseBoundedPositiveInteger(annularP.value, INPUT_LIMITS.annularP);
  const parsedQ = parseBoundedPositiveInteger(annularQ.value, INPUT_LIMITS.annularQ);
  if (!parsedP.ok || !parsedQ.ok || parsedP.value + parsedQ.value > INPUT_LIMITS.annularTotalSupport) return;
  annularRandomDistribution.value = defaultAnnularRandomDensity(parsedP.value, parsedQ.value);
}

function populateExamples(): void {
  exampleSelect.replaceChildren();
  const examples: readonly { id: string; label: string }[] = state.mode === "disc" ? EXAMPLES : ANNULAR_EXAMPLES;
  examples.forEach((example) => exampleSelect.add(new Option(example.label, example.id)));
  exampleSelect.add(new Option("Custom", "custom"));
  syncExampleSelector();
}

function syncExampleSelector(): void {
  if (exampleSelect.options.length === 0) return;
  if (state.mode === "disc") {
    const notation = partitionToString(state.discPartition);
    exampleSelect.value = EXAMPLES.find((example) => example.notation === notation)?.id ?? "custom";
  } else {
    const notation = state.annular.sourceNotation;
    exampleSelect.value = ANNULAR_EXAMPLES.find((example) => example.p === state.annular.permutation.p && example.q === state.annular.permutation.q && example.notation === notation)?.id ?? "custom";
  }
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
  routingProgressLabel.textContent = "Routing…";
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
    const resolvedNotation = annularPermutationToString(permutation);
    annularComplementState = { ok: true, permutation, routed, interpretation: "strict-permutation", sourceNotation: resolvedNotation, resolvedNotation, wasAutoOriented: false, canonicalNotation: resolvedNotation };
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
  if (exampleSelect.value === "custom") return;
  if (state.mode === "disc") { const example = getExample(exampleSelect.value); discInput.value = example.notation; acceptDiscInput(example.notation); }
  else { const example = getAnnularExample(exampleSelect.value); annularP.value = String(example.p); annularQ.value = String(example.q); syncRandomDistributionDefault(); annularInput.value = example.notation; queueAnnularInput(String(example.p), String(example.q), example.notation); }
});
discForm.addEventListener("submit", (event) => { event.preventDefault(); acceptDiscInput(discInput.value); });
annularForm.addEventListener("submit", (event) => { event.preventDefault(); queueAnnularInput(annularP.value, annularQ.value, annularInput.value); });
annularInterpretationControls.forEach((control) => control.addEventListener("change", () => {
  if (control.checked) annularInputInterpretation = control.value as AnnularInputInterpretation;
}));
discRandomButton.addEventListener("click", () => {
  const parsedN = parseBoundedPositiveInteger(discN.value, INPUT_LIMITS.discSupport);
  if (!parsedN.ok) { discMessage.dataset.state = "error"; discMessage.textContent = boundedIntegerErrorMessage("n", parsedN.reason, INPUT_LIMITS.discSupport); return; }
  const partition = randomNoncrossingPartition(parsedN.value);
  discInput.value = partitionToString(partition); acceptDiscInput(discInput.value);
});
annularRandomButton.addEventListener("click", () => {
  const parsedP = parseBoundedPositiveInteger(annularP.value, INPUT_LIMITS.annularP);
  const parsedQ = parseBoundedPositiveInteger(annularQ.value, INPUT_LIMITS.annularQ);
  if (!parsedP.ok) { annularMessage.dataset.state = "error"; annularMessage.textContent = boundedIntegerErrorMessage("p", parsedP.reason, INPUT_LIMITS.annularP); return; }
  if (!parsedQ.ok) { annularMessage.dataset.state = "error"; annularMessage.textContent = boundedIntegerErrorMessage("q", parsedQ.reason, INPUT_LIMITS.annularQ); return; }
  if (parsedP.value + parsedQ.value > INPUT_LIMITS.annularTotalSupport) { annularMessage.dataset.state = "error"; annularMessage.textContent = `Use p ≤ ${INPUT_LIMITS.annularP}, q ≤ ${INPUT_LIMITS.annularQ}, and p+q ≤ ${INPUT_LIMITS.annularTotalSupport}.`; return; }
  const p = parsedP.value; const q = parsedQ.value;
  annularInputInterpretation = "strict-permutation";
  annularInterpretationControls.forEach((control) => { control.checked = control.value === annularInputInterpretation; });
  const generation = ++annularRequestGeneration;
  const requestedDistribution = annularRandomDistribution.value as AnnularRandomMode;
  annularMessage.dataset.state = "pending";
  annularMessage.textContent = "Routing a genuine connected ANC…";
  routingProgress.hidden = false;
  routingProgressLabel.textContent = "Routing random ANC — up to 4 bounded attempts…";
  window.setTimeout(() => {
    if (generation !== annularRequestGeneration) return;
    try {
      const generated = routeAwareRandomAnnularPermutation(p, q, requestedDistribution);
      if (generation !== annularRequestGeneration) return;
      if (!generated.ok) {
        annularStatusOverride = null;
        annularMessage.dataset.state = "error";
        annularMessage.textContent = generated.lastFailure
          ? `${annularRoutingFailureMessage(generated.lastFailure)} Random ANC tried ${generated.attempts} bounded connected candidates; the previous diagram was retained.`
          : "No distinct connected random ANC candidate could be generated; the previous diagram was retained.";
        return;
      }
      const notation = annularPermutationToString(generated.permutation);
      const accepted: AcceptedAnnularInput = Object.freeze({
        ok: true,
        permutation: generated.permutation,
        routed: generated.routed,
        interpretation: "strict-permutation",
        sourceNotation: notation,
        resolvedNotation: notation,
        wasAutoOriented: false,
        canonicalNotation: notation,
      });
      annularInput.value = notation;
      const distribution = generated.density[0]?.toUpperCase() + generated.density.slice(1);
      const fallback = generated.usedMinimalFallback
        ? `Showing ${distribution} minimal connected fallback after ${generated.attempts} bounded attempts.`
        : generated.usedSparseFallback
          ? `Showing ${distribution} fallback after ${generated.attempts} bounded attempts.`
          : `Showing ${distribution} connected ANC after ${generated.attempts} bounded attempt${generated.attempts === 1 ? "" : "s"}.`;
      commitAcceptedAnnularInput(accepted, { state: "valid", message: `${fallback} τ = ${notation} · (p,q)=(${p},${q})` });
    } catch (error) {
      console.error("Random ANC generation failed", error);
      annularStatusOverride = null;
      annularMessage.dataset.state = "error";
      const detail = error instanceof Error ? ` (${error.message})` : "";
      annularMessage.textContent = `Random ANC generation encountered an unexpected failure${detail}; the previous diagram was retained.`;
    } finally {
      if (generation === annularRequestGeneration) routingProgress.hidden = true;
    }
  }, 0);
});
annularRandomDistribution.addEventListener("change", () => { distributionWasExplicitlyChosen = true; });
[annularP, annularQ].forEach((control) => control.addEventListener("input", syncRandomDistributionDefault));
surfaceControls.forEach((control) => control.addEventListener("change", () => { if (control.checked) showSurface(control.value as SurfaceMode); }));
discDisplayControls.forEach((control) => control.addEventListener("change", () => { if (control.checked) { discDisplayMode = control.value as DiscDisplayMode; selectedEdge = null; updateSelection(null); redraw(); } }));
annularDisplayControls.forEach((control) => control.addEventListener("change", () => {
  if (!control.checked) return;
  annularStatusOverride = null;
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
undoCurveButton.addEventListener("click", () => {
  const previous = annularEditHistory.pop();
  if (!previous) return;
  state.annular = previous;
  annularStatusOverride = { state: "valid", message: "Restored the previous verified curve." };
  updateSelection(selectedEdge); redraw();
});
resetCurveButton.addEventListener("click", () => {
  if (state.annular === annularEditBaseline) return;
  rememberAnnularEditState(state.annular);
  state.annular = annularEditBaseline;
  annularStatusOverride = { state: "valid", message: "Reset all curve edits for this permutation." };
  updateSelection(selectedEdge); redraw();
});
exportButton.addEventListener("click", () => {
  if (!currentSvg) return;
  const filename = state.mode === "disc" ? `disc-partition-n${state.discPartition.n}.svg` : `annular-permutation-p${state.annular.permutation.p}-q${state.annular.permutation.q}.svg`;
  downloadSvg(currentSvg, filename, numberFontControl.value);
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
syncRandomDistributionDefault();
populatePalettes();
updateSelection(null); showSurface("disc");
