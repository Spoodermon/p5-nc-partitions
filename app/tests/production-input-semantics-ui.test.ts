// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";

describe("annular input interpretation UI", () => {
  beforeAll(async () => {
    Object.defineProperty(SVGElement.prototype, "getBBox", {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 20, height: 20 }),
    });
    document.body.innerHTML = `
      <main>
        <div id="figure"></div><div id="figure-shell"></div>
        <select id="example-select"></select><input id="direction-toggle" type="checkbox"><input id="ribbon-fill-toggle" type="checkbox">
        <input id="cycle-edge-thickness" value="3.4"><output id="cycle-edge-thickness-output"></output>
        <input id="outer-boundary-thickness" value="2.5"><output id="outer-boundary-thickness-output"></output>
        <input id="inner-boundary-thickness" value="2.5"><output id="inner-boundary-thickness-output"></output><label id="inner-boundary-control"></label>
        <button id="export-button"></button><button id="clear-button"></button><output id="selection-output"></output>
        <form id="disc-form"></form><input id="disc-n"><input id="disc-input"><button id="disc-random-button"></button><p id="disc-message"></p><div id="disc-controls"></div>
        <form id="annular-form"></form><input id="annular-p"><input id="annular-q"><input id="annular-input"><button id="annular-random-button"></button><p id="annular-message"></p><div id="annular-controls"></div>
        <div id="routing-progress"></div><span id="routing-progress-label"></span>
        <select id="color-mode"><option value="palette">Palette</option></select><div id="palette-options"></div><label id="single-color-control"></label><input id="single-color" value="#176b75">
        <div id="kind-color-controls"></div><input id="outer-cycle-color" value="#176b75"><input id="inner-cycle-color" value="#a35428"><input id="through-cycle-color" value="#62549a"><div id="cycle-color-controls"></div>
        <select id="number-font"><option value="Newsreader">Newsreader</option></select>
        <input type="radio" name="surface-mode" value="disc" checked><input type="radio" name="surface-mode" value="annular">
        <input type="radio" name="disc-display-mode" value="partition" checked><input type="radio" name="disc-display-mode" value="kreweras">
        <input type="radio" name="annular-display-mode" value="permutation" checked><input type="radio" name="annular-display-mode" value="kreweras">
        <input type="radio" name="annular-input-interpretation" value="strict-permutation" checked><input type="radio" name="annular-input-interpretation" value="canonical-blocks">
      </main>`;
    await import("../src/main");
  });

  it("switches interpretation and surfaces without rewriting the typed permutation", () => {
    const input = document.querySelector<HTMLInputElement>("#annular-input")!;
    const canonical = document.querySelector<HTMLInputElement>('input[name="annular-input-interpretation"][value="canonical-blocks"]')!;
    const annularSurface = document.querySelector<HTMLInputElement>('input[name="surface-mode"][value="annular"]')!;
    const discSurface = document.querySelector<HTMLInputElement>('input[name="surface-mode"][value="disc"]')!;
    input.value = "  (1 4 3)(2)(5)(6)  ";
    canonical.checked = true;
    canonical.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input.value).toBe("  (1 4 3)(2)(5)(6)  ");

    annularSurface.checked = true;
    annularSurface.dispatchEvent(new Event("change", { bubbles: true }));
    discSurface.checked = true;
    discSurface.dispatchEvent(new Event("change", { bubbles: true }));
    annularSurface.checked = true;
    annularSurface.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input.value).toBe("  (1 4 3)(2)(5)(6)  ");
  });
});
