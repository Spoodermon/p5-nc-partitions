import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const FONT_ALIASES = Object.freeze({
  Newsreader: "PVEmbeddedNewsreader",
  Geist: "PVEmbeddedGeist",
  "Geist Mono": "PVEmbeddedGeistMono",
});

test("settings disclosures are initially closed and keyboard operable", async ({ page }) => {
  await page.goto("/");
  const lineWeights = page.locator(".thickness-controls .settings-disclosure");
  const lineSummary = lineWeights.locator("summary");
  const cycleColours = page.locator(".color-controls .settings-disclosure");
  const colourSummary = cycleColours.locator("summary");

  await expect(lineWeights).not.toHaveAttribute("open", "");
  await expect(cycleColours).not.toHaveAttribute("open", "");
  await expect(page.locator("#cycle-edge-thickness")).toBeHidden();
  await expect(page.locator("#color-mode")).toBeHidden();
  await expect(page.locator("#selection-output")).toBeVisible();

  await lineSummary.focus();
  await lineSummary.press("Enter");
  await expect(lineWeights).toHaveAttribute("open", "");
  await expect(page.locator("#cycle-edge-thickness")).toBeVisible();
  await lineSummary.press("Space");
  await expect(lineWeights).not.toHaveAttribute("open", "");

  await colourSummary.click();
  await expect(cycleColours).toHaveAttribute("open", "");
  await expect(page.locator("#color-mode")).toBeVisible();
});

test("each downloaded SVG embeds only the selected number font", async ({ page }) => {
  await page.goto("/");
  await page.locator(".thickness-controls summary").click();

  for (const [fontId, alias] of Object.entries(FONT_ALIASES)) {
    await page.locator("#number-font").selectOption(fontId);
    await page.locator("#figure-shell").hover({ position: { x: 20, y: 20 } });
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-button").click();
    const download = await downloadPromise;
    const path = await download.path();
    if (!path) throw new Error(`No local path for ${fontId} SVG download`);
    const svg = await readFile(path, "utf8");

    expect(svg).toContain(`data-export-font="${fontId}"`);
    expect(svg.match(/@font-face/g)).toHaveLength(1);
    expect(svg).toContain("data:font/woff2;base64,");
    expect(svg).toContain(`font-family="${alias}"`);
    expect(svg).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/);
    for (const otherAlias of Object.values(FONT_ALIASES).filter((candidate) => candidate !== alias)) {
      expect(svg).not.toContain(`font-family:${otherAlias};`);
      expect(svg).not.toContain(`font-family="${otherAlias}"`);
    }

    const loaded = await page.evaluate(async ({ source, family }) => {
      const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
      const parserError = parsed.querySelector("parsererror")?.textContent ?? null;
      if (parserError) return { parserError, hasLoadedFace: false };

      const frame = document.createElement("iframe");
      frame.hidden = true;
      const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
      frame.src = url;
      document.body.append(frame);
      await new Promise<void>((resolve, reject) => {
        frame.addEventListener("load", () => resolve(), { once: true });
        frame.addEventListener("error", () => reject(new Error("Exported SVG did not load")), { once: true });
      });
      const fonts = frame.contentDocument?.fonts;
      if (fonts) {
        await fonts.load(`600 28px ${family}`, "123");
        await fonts.ready;
      }
      const hasLoadedFace = fonts ? [...fonts].some((face) => face.family.replaceAll('"', "") === family && face.status === "loaded") : false;
      frame.remove();
      URL.revokeObjectURL(url);
      return { parserError: null, hasLoadedFace };
    }, { source: svg, family: alias });
    expect(loaded.parserError).toBeNull();
    expect(loaded.hasLoadedFace).toBe(true);
  }
});
