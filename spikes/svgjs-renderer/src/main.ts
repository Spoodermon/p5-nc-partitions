import "./style.css";
import { EXAMPLES, getExample, type ExampleId } from "./examples";
import { downloadSvg } from "./export";
import { renderDiagram } from "./renderer";
import type { DirectedEdge } from "./geometry";

const figure = requireElement<HTMLDivElement>("figure");
const exampleSelect = requireElement<HTMLSelectElement>("example-select");
const directionToggle = requireElement<HTMLInputElement>("direction-toggle");
const exportButton = requireElement<HTMLButtonElement>("export-button");
const clearButton = requireElement<HTMLButtonElement>("clear-button");
const selectionOutput = requireElement<HTMLOutputElement>("selection-output");

let selectedExampleId: ExampleId = "two-cycle";
let selectedEdge: DirectedEdge | null = null;
let currentSvg: SVGSVGElement | null = null;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element as T;
}

function edgeMetadata(edge: DirectedEdge | null): string {
  if (!edge) return "No edge selected";
  return `cycle: (${edge.cycle.join(" ")}) · edge: ${edge.start} → ${edge.end} · role: ${edge.role}`;
}

function updateSelection(edge: DirectedEdge | null): void {
  selectionOutput.value = edgeMetadata(edge);
  clearButton.disabled = edge === null;
}

function redraw(): void {
  const example = getExample(selectedExampleId);
  const rendered = renderDiagram(
    figure,
    example,
    { showDirection: directionToggle.checked, selectedEdgeId: selectedEdge?.id ?? null },
    {
      onSelect: (edge) => {
        selectedEdge = edge;
        updateSelection(edge);
        redraw();
      },
    },
  );
  currentSvg = rendered.svg;
}

EXAMPLES.forEach((example) => {
  const option = document.createElement("option");
  option.value = example.id;
  option.textContent = example.label;
  exampleSelect.append(option);
});

exampleSelect.value = selectedExampleId;
exampleSelect.addEventListener("change", () => {
  selectedExampleId = exampleSelect.value as ExampleId;
  selectedEdge = null;
  updateSelection(null);
  redraw();
});

directionToggle.addEventListener("change", redraw);
clearButton.addEventListener("click", () => {
  selectedEdge = null;
  updateSelection(null);
  redraw();
});
exportButton.addEventListener("click", () => {
  if (!currentSvg) return;
  downloadSvg(currentSvg, `permutation-${selectedExampleId}.svg`);
});

redraw();
