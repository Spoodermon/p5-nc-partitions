import "./style.css";
import type { DirectedEdge } from "./geometry/disc";
import {
  krewerasComplement,
  mathErrorMessage,
  parseNoncrossingPartition,
  partitionToString,
  type DiscPartition,
} from "./math";
import { downloadSvg } from "./renderer/export";
import { partitionDiagram } from "./renderer/model";
import { renderDiagram } from "./renderer/svgRenderer";
import { EXAMPLES, getExample } from "./ui/examples";

type DisplayMode = "partition" | "kreweras";

const figure = requireElement<HTMLDivElement>("figure");
const exampleSelect = requireElement<HTMLSelectElement>("example-select");
const directionToggle = requireElement<HTMLInputElement>("direction-toggle");
const ribbonFillToggle = requireElement<HTMLInputElement>("ribbon-fill-toggle");
const cycleEdgeThickness = requireElement<HTMLInputElement>("cycle-edge-thickness");
const cycleEdgeThicknessOutput = requireElement<HTMLOutputElement>("cycle-edge-thickness-output");
const outerBoundaryThickness = requireElement<HTMLInputElement>("outer-boundary-thickness");
const outerBoundaryThicknessOutput = requireElement<HTMLOutputElement>("outer-boundary-thickness-output");
const exportButton = requireElement<HTMLButtonElement>("export-button");
const clearButton = requireElement<HTMLButtonElement>("clear-button");
const selectionOutput = requireElement<HTMLOutputElement>("selection-output");
const partitionForm = requireElement<HTMLFormElement>("partition-form");
const partitionInput = requireElement<HTMLInputElement>("partition-input");
const partitionMessage = requireElement<HTMLParagraphElement>("partition-message");
const displayModeControls = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="display-mode"]'));

let sourcePartition = requiredPartition(getExample("two-cycle").notation);
let displayMode: DisplayMode = "partition";
let selectedEdge: DirectedEdge | null = null;
let currentSvg: SVGSVGElement | null = null;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element as T;
}

function requiredPartition(input: string): DiscPartition {
  const result = parseNoncrossingPartition(input);
  if (!result.ok) throw new Error(`Invalid built-in example: ${result.error.kind}`);
  return result.value;
}

function displayedPartition(): DiscPartition {
  return displayMode === "partition" ? sourcePartition : krewerasComplement(sourcePartition);
}

function edgeMetadata(edge: DirectedEdge | null): string {
  if (!edge) return "No edge selected";
  return `cycle: (${edge.cycle.join(" ")}) · edge: ${edge.start} → ${edge.end} · role: ${edge.role}`;
}

function updateSelection(edge: DirectedEdge | null): void {
  selectionOutput.value = edgeMetadata(edge);
  clearButton.disabled = edge === null;
}

function updatePartitionMessage(): void {
  const prefix = displayMode === "partition" ? "π" : "Kr(π)";
  partitionMessage.dataset.state = "valid";
  partitionMessage.textContent = `${prefix} = ${partitionToString(displayedPartition())}`;
}

function redraw(): void {
  const rendered = renderDiagram(
    figure,
    partitionDiagram(displayedPartition()),
    {
      showDirection: directionToggle.checked,
      showRibbonFill: ribbonFillToggle.checked,
      selectedEdgeId: selectedEdge?.id ?? null,
      cycleEdgeWidth: Number(cycleEdgeThickness.value),
      outerBoundaryWidth: Number(outerBoundaryThickness.value),
    },
    {
      onSelect: (edge) => {
        selectedEdge = edge;
        updateSelection(edge);
        redraw();
      },
    },
  );
  currentSvg = rendered.svg;
  updatePartitionMessage();
}

function acceptPartitionInput(input: string): boolean {
  const result = parseNoncrossingPartition(input);
  if (!result.ok) {
    partitionMessage.dataset.state = "error";
    partitionMessage.textContent = mathErrorMessage(result.error);
    return false;
  }

  sourcePartition = result.value;
  partitionInput.value = partitionToString(sourcePartition);
  selectedEdge = null;
  updateSelection(null);
  redraw();
  return true;
}

EXAMPLES.forEach((example) => {
  const option = document.createElement("option");
  option.value = example.id;
  option.textContent = example.label;
  exampleSelect.append(option);
});

exampleSelect.value = "two-cycle";
partitionInput.value = partitionToString(sourcePartition);
exampleSelect.addEventListener("change", () => {
  const example = getExample(exampleSelect.value);
  partitionInput.value = example.notation;
  acceptPartitionInput(example.notation);
});

partitionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  acceptPartitionInput(partitionInput.value);
});

displayModeControls.forEach((control) => {
  control.addEventListener("change", () => {
    if (!control.checked) return;
    displayMode = control.value as DisplayMode;
    selectedEdge = null;
    updateSelection(null);
    redraw();
  });
});

directionToggle.addEventListener("change", redraw);
ribbonFillToggle.addEventListener("change", redraw);
for (const [control, output] of [
  [cycleEdgeThickness, cycleEdgeThicknessOutput],
  [outerBoundaryThickness, outerBoundaryThicknessOutput],
] as const) {
  control.addEventListener("input", () => {
    output.value = control.value;
    redraw();
  });
}
clearButton.addEventListener("click", () => {
  selectedEdge = null;
  updateSelection(null);
  redraw();
});
exportButton.addEventListener("click", () => {
  if (!currentSvg) return;
  downloadSvg(currentSvg, `disc-partition-${displayMode}-${sourcePartition.n}.svg`);
});

updateSelection(null);
redraw();
