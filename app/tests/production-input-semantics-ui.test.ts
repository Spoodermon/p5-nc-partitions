// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { INPUT_LIMITS } from "../src/config/limits";
import productionMarkup from "../index.html?raw";

describe("annular input interpretation UI", () => {
  beforeAll(async () => {
    Object.defineProperty(SVGElement.prototype, "getBBox", {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 20, height: 20 }),
    });
    document.documentElement.innerHTML = productionMarkup;
    await import("../src/main");
  });

  it("advertises the runtime character ceilings on every user text field", () => {
    for (const selector of ["#disc-input", "#annular-input"]) {
      expect(document.querySelector<HTMLInputElement>(selector)?.maxLength).toBe(INPUT_LIMITS.inputCharacters);
    }
    for (const selector of ["#disc-n", "#annular-p", "#annular-q"]) {
      expect(document.querySelector<HTMLInputElement>(selector)?.maxLength).toBe(INPUT_LIMITS.numericInputCharacters);
    }
  });

  it("reports raw numeric length failures accurately even for programmatic values", () => {
    const oversized = "9".repeat(INPUT_LIMITS.numericInputCharacters + 1);
    const discN = document.querySelector<HTMLInputElement>("#disc-n")!;
    discN.value = oversized;
    document.querySelector<HTMLButtonElement>("#disc-random-button")!.click();
    expect(document.querySelector("#disc-message")?.textContent).toContain(`${INPUT_LIMITS.numericInputCharacters} characters`);

    const annularP = document.querySelector<HTMLInputElement>("#annular-p")!;
    annularP.value = oversized;
    document.querySelector<HTMLButtonElement>("#annular-random-button")!.click();
    expect(document.querySelector("#annular-message")?.textContent).toContain(`${INPUT_LIMITS.numericInputCharacters} characters`);
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
