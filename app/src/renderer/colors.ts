export interface NamedPalette {
  readonly id: string;
  readonly name: string;
  readonly colors: readonly string[];
}

export const NAMED_PALETTES: readonly NamedPalette[] = Object.freeze([
  { id: "tidepool", name: "Tidepool", colors: ["#176b75", "#a35428", "#62549a", "#347653", "#a33f56", "#80651f", "#2b6cb0", "#8b5e83"] },
  { id: "ember", name: "Ember", colors: ["#7f1d1d", "#b45309", "#d97706", "#eab308", "#9a3412", "#be123c", "#92400e", "#6b3a2a"] },
  { id: "botanical", name: "Botanical", colors: ["#14532d", "#3f6212", "#0f766e", "#4d7c0f", "#166534", "#47705b", "#718355", "#2d6a4f"] },
  { id: "plum", name: "Plum", colors: ["#581c87", "#7e22ce", "#9d174d", "#6d28d9", "#86198f", "#be185d", "#4338ca", "#7c3aed"] },
  { id: "nordic", name: "Nordic", colors: ["#264653", "#2a6f97", "#468faf", "#52796f", "#6c757d", "#577590", "#4d908e", "#277da1"] },
  { id: "sunset", name: "Sunset", colors: ["#ef476f", "#f78c6b", "#ffd166", "#f4a261", "#e76f51", "#c44536", "#ff6b6b", "#bc4749"] },
  { id: "ink", name: "Ink", colors: ["#111827", "#334155", "#475569", "#1f2937", "#4b5563", "#374151", "#64748b", "#0f172a"] },
  { id: "pastel", name: "Pastel", colors: ["#4f86c6", "#ca6680", "#7b8c4c", "#8b72be", "#c17c3a", "#4e9a8d", "#a35f88", "#627d98"] },
]);

export const DEFAULT_CYCLE_COLOR = NAMED_PALETTES[0]?.colors[0] ?? "#176b75";

export function paletteById(id: string): NamedPalette {
  return NAMED_PALETTES.find((palette) => palette.id === id) ?? NAMED_PALETTES[0] as NamedPalette;
}
