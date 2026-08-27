import geistDataUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?inline";
import geistMonoDataUrl from "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?inline";
import newsreaderDataUrl from "@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2?inline";

export const NUMBER_FONT_IDS = ["Newsreader", "Geist", "Geist Mono"] as const;
export type NumberFontId = typeof NUMBER_FONT_IDS[number];

export interface NumberFontDefinition {
  readonly id: NumberFontId;
  readonly liveFamily: string;
  readonly stack: string;
  readonly exportFamily: string;
  readonly dataUrl: string;
  readonly weightRange: string;
}

const DEFAULT_NUMBER_FONT_ID: NumberFontId = "Newsreader";

const NUMBER_FONTS: Readonly<Record<NumberFontId, NumberFontDefinition>> = Object.freeze({
  Newsreader: Object.freeze({
    id: "Newsreader",
    liveFamily: "Newsreader Variable",
    stack: '"Newsreader Variable", Georgia, "Times New Roman", serif',
    exportFamily: "PVEmbeddedNewsreader",
    dataUrl: newsreaderDataUrl,
    weightRange: "200 800",
  }),
  Geist: Object.freeze({
    id: "Geist",
    liveFamily: "Geist Variable",
    stack: '"Geist Variable", ui-sans-serif, system-ui, sans-serif',
    exportFamily: "PVEmbeddedGeist",
    dataUrl: geistDataUrl,
    weightRange: "100 900",
  }),
  "Geist Mono": Object.freeze({
    id: "Geist Mono",
    liveFamily: "Geist Mono Variable",
    stack: '"Geist Mono Variable", ui-monospace, monospace',
    exportFamily: "PVEmbeddedGeistMono",
    dataUrl: geistMonoDataUrl,
    weightRange: "100 900",
  }),
});

export function resolveNumberFont(value: string | undefined): NumberFontDefinition {
  if (value && Object.hasOwn(NUMBER_FONTS, value)) return NUMBER_FONTS[value as NumberFontId];
  return NUMBER_FONTS[DEFAULT_NUMBER_FONT_ID];
}

export function numberFontStack(value: string | undefined): string {
  return resolveNumberFont(value).stack;
}

export function installNumberFonts(target: Document = document): void {
  if (target.getElementById("permutation-visualizer-fonts")) return;
  const style = target.createElement("style");
  style.id = "permutation-visualizer-fonts";
  style.textContent = NUMBER_FONT_IDS.map((id) => {
    const font = NUMBER_FONTS[id];
    return `@font-face{font-family:"${font.liveFamily}";src:url("${font.dataUrl}") format("woff2");font-style:normal;font-weight:${font.weightRange};font-display:swap;}`;
  }).join("\n");
  target.head.append(style);
}
