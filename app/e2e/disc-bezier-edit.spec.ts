import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("disc edges expose verified Bézier controls with undo and exact pinned anchors", async ({ page }) => {
  await page.goto("/");
  const edge = page.locator('[data-layer="edges"] [data-role="forward"]').first();
  const before = await edge.getAttribute("d");
  const start = await edge.evaluate((path) => {
    const data = path.getAttribute("d") ?? "";
    return data.match(/^M\s+(-?[\d.]+)\s+(-?[\d.]+)/)?.slice(1) ?? [];
  });
  await edge.dispatchEvent("click");

  const handles = page.locator(".curve-control-handle");
  await expect(handles).toHaveCount(2);
  await handles.first().focus();
  await handles.first().press("ArrowRight");
  await expect(handles.first()).toBeFocused();
  await expect(page.locator("#disc-message")).toContainText("Curve adjusted and admitted");
  await expect(page.locator("#undo-curve-button")).toBeEnabled();

  const after = await edge.getAttribute("d");
  expect(after).not.toBe(before);
  const editedStart = after?.match(/^M\s+(-?[\d.]+)\s+(-?[\d.]+)/)?.slice(1) ?? [];
  expect(editedStart).toEqual(start);

  await page.locator("#figure-shell").hover({ position: { x: 20, y: 20 } });
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Missing edited SVG download");
  const svg = await readFile(downloadPath, "utf8");
  expect(svg).toContain(`d="${after}"`);
  expect(svg).not.toContain("data-editor-overlay");
  expect(svg).not.toContain("curve-control-handle");

  await page.locator("#undo-curve-button").click();
  await expect(page.locator("#disc-message")).toContainText("Restored the previous verified curve");
  await expect(edge).toHaveAttribute("d", before ?? "");
});

test("disc singleton loops expose the same two-control editor", async ({ page }) => {
  await page.goto("/");
  await page.locator("#example-select").selectOption("representative");
  const singleton = page.locator('[data-layer="edges"] [data-role="singleton"]').first();
  await singleton.dispatchEvent("click");
  await expect(page.locator(".curve-control-handle")).toHaveCount(2);
  await expect(page.locator('[data-editor-overlay="true"] line')).toHaveCount(2);
  await page.locator('.curve-control-handle[data-control-index="1"]').focus();
  await page.locator('.curve-control-handle[data-control-index="1"]').press("ArrowDown");
  await expect(page.locator("#disc-message")).toContainText("Curve adjusted and admitted");
});

test("blank canvas clicks and Escape clear the selected edge without controls doing so", async ({ page }) => {
  await page.goto("/");
  const edge = page.locator('[data-layer="edges"] .permutation-edge').first();
  await edge.dispatchEvent("click");
  await expect(page.locator(".curve-control-handle")).toHaveCount(2);

  await page.locator("#disc-n").click();
  await expect(page.locator(".curve-control-handle")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.locator(".curve-control-handle")).toHaveCount(0);
  await expect(page.locator("#selection-output")).toHaveText("No edge selected");

  await edge.dispatchEvent("click");
  await expect(page.locator(".curve-control-handle")).toHaveCount(2);
  await page.locator(".side-panel.thickness-controls").click({ position: { x: 8, y: 8 } });
  await expect(page.locator(".curve-control-handle")).toHaveCount(0);
  await expect(page.locator("#selection-output")).toHaveText("No edge selected");

  await edge.dispatchEvent("click");
  await expect(page.locator(".curve-control-handle")).toHaveCount(2);
  await page.locator("#figure svg").click({ position: { x: 20, y: 20 } });
  await expect(page.locator(".curve-control-handle")).toHaveCount(0);
  await expect(page.locator("#selection-output")).toHaveText("No edge selected");
});

test("Kr(π) remains inspectable but intentionally has no mutable control overlay", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[name="disc-display-mode"][value="kreweras"]').check();
  await page.locator('[data-layer="edges"] .permutation-edge').first().dispatchEvent("click");
  await expect(page.locator(".curve-control-handle")).toHaveCount(0);
  await expect(page.locator("#undo-curve-button")).toBeHidden();
});

test("pointer editing restores handle focus and never exposes an unverified preview to export", async ({ page }) => {
  await page.goto("/");
  const edge = page.locator('[data-layer="edges"] [data-role="forward"]').first();
  await edge.focus();
  await edge.press("Enter");
  const handle = page.locator('.curve-control-handle[data-control-index="1"]');
  await expect(handle).toBeFocused();
  const before = await edge.getAttribute("d");
  const box = await handle.boundingBox();
  if (!box) throw new Error("Missing control handle bounds");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2);
  await expect(page.locator("#export-button")).toBeDisabled();
  await page.mouse.up();
  await expect(page.locator("#export-button")).toBeEnabled();
  await expect(handle).toBeFocused();
  await expect(edge).not.toHaveAttribute("d", before ?? "");

  const admitted = await edge.getAttribute("d");
  const nextBox = await handle.boundingBox();
  if (!nextBox) throw new Error("Missing redrawn control handle bounds");
  await page.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(nextBox.x + nextBox.width / 2 + 6, nextBox.y + nextBox.height / 2 + 2);
  await expect(page.locator("#export-button")).toBeDisabled();
  await handle.dispatchEvent("pointercancel", { pointerId: 1 });
  await expect(page.locator("#export-button")).toBeEnabled();
  await expect(edge).toHaveAttribute("d", admitted ?? "");
  await expect(handle).toBeFocused();
});

test("disc edits persist across π and Kr(π), then Reset restores the admitted baseline", async ({ page }) => {
  await page.goto("/");
  const edge = page.locator('[data-layer="edges"] [data-role="forward"]').first();
  const baseline = await edge.getAttribute("d");
  await edge.dispatchEvent("click");
  await page.locator('.curve-control-handle[data-control-index="1"]').press("ArrowRight");
  const edited = await edge.getAttribute("d");
  expect(edited).not.toBe(baseline);

  await page.locator('input[name="disc-display-mode"][value="kreweras"]').check();
  await page.locator('input[name="disc-display-mode"][value="partition"]').check();
  await expect(edge).toHaveAttribute("d", edited ?? "");
  await edge.dispatchEvent("click");
  await page.locator("#reset-curve-button").click();
  await expect(edge).toHaveAttribute("d", baseline ?? "");
});

test("invalid disc input remains announced after unrelated redraws", async ({ page }) => {
  await page.goto("/");
  await page.locator("#disc-input").fill("(1 3)(2 4)");
  await page.locator("#disc-form button[type=submit]").click();
  const message = page.locator("#disc-message");
  await expect(message).not.toBeEmpty();
  const text = await message.textContent();
  await page.locator("#direction-toggle").check();
  await expect(message).toHaveText(text ?? "");
});
