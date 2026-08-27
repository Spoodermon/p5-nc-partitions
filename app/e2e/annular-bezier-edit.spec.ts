import { expect, test } from "@playwright/test";

test("selected annular cubics expose draggable verified controls with undo", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[name="surface-mode"][value="annular"]').check();
  const edge = page.locator('[data-cycle-edge][data-role="forward"]').first();
  await edge.dispatchEvent("click");

  const handles = page.locator(".curve-control-handle");
  await expect(handles).toHaveCount(2);
  await expect(handles.first()).toHaveAttribute("role", "button");
  let bounds = await handles.first().boundingBox();
  if (!bounds) throw new Error("Missing Bézier control bounds");
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.locator("#undo-curve-button")).toBeDisabled();
  bounds = await handles.first().boundingBox();
  if (!bounds) throw new Error("Missing Bézier control bounds after no-op click");
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 2, y + 1, { steps: 2 });
  await page.mouse.up();

  await expect(page.locator("#annular-message")).toContainText("Curve adjusted and admitted");
  await expect(page.locator("#undo-curve-button")).toBeVisible();
  await expect(page.locator("#undo-curve-button")).toBeEnabled();
  await page.locator("#undo-curve-button").click();
  await expect(page.locator("#annular-message")).toContainText("Restored the previous verified curve");
  await handles.first().focus();
  await handles.first().press("ArrowRight");
  await expect(handles.first()).toBeFocused();
  await expect(page.locator("#annular-message")).toContainText("Curve adjusted and admitted");
});

test("an invalid pointer release restores the exact prior curve", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[name="surface-mode"][value="annular"]').check();
  const forward = page.locator('[data-cycle="(1 4)"][data-role="forward"]');
  const reverse = page.locator('[data-cycle="(1 4)"][data-role="return"]');
  await forward.dispatchEvent("click");

  const forced = await page.locator('[data-editor-overlay="true"]').evaluate((overlay, obstacle) => {
    const group = overlay as SVGGElement;
    const reversePath = document.querySelector<SVGPathElement>(obstacle.selector);
    const svg = group.ownerSVGElement;
    if (!reversePath || !svg) throw new Error("Missing collision geometry");
    const midpoint = reversePath.getPointAtLength(reversePath.getTotalLength() / 2);
    const centerX = Number(group.dataset.centerX);
    const centerY = Number(group.dataset.centerY);
    const innerRadius = Number(group.dataset.innerRadius);
    const outerRadius = Number(group.dataset.outerRadius);
    const startTheta = Number(group.dataset.startTheta);
    const endTheta = Number(group.dataset.endTheta);
    const dx = midpoint.x - centerX;
    const dy = midpoint.y - centerY;
    const targetU = Math.log(Math.hypot(dx, dy) / innerRadius) / Math.log(outerRadius / innerRadius);
    const rawTheta = Math.atan2(dy, dx);
    const reference = (startTheta + endTheta) / 2;
    const targetTheta = rawTheta + Math.round((reference - rawTheta) / (2 * Math.PI)) * 2 * Math.PI;
    const controlTheta = (8 * targetTheta - startTheta - endTheta) / 6;
    const startU = 1;
    const endU = 0;
    const controlU = (8 * targetU - startU - endU) / 6;
    const radius = innerRadius * (outerRadius / innerRadius) ** controlU;
    const local = new DOMPoint(centerX + radius * Math.cos(controlTheta), centerY + radius * Math.sin(controlTheta));
    const screen = local.matrixTransform(svg.getScreenCTM() ?? new DOMMatrix());
    return { x: screen.x, y: screen.y, controlU };
  }, { selector: '[data-cycle="(1 4)"][data-role="return"]' });
  expect(forced.controlU).toBeGreaterThanOrEqual(0);
  expect(forced.controlU).toBeLessThanOrEqual(1);

  const dragHandle = async (index: number): Promise<void> => {
    const handle = page.locator(`.curve-control-handle[data-control-index="${index}"]`);
    const box = await handle.boundingBox();
    if (!box) throw new Error("Missing control handle");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(forced.x, forced.y, { steps: 4 });
    await page.mouse.up();
  };

  let priorPath = await forward.getAttribute("d");
  await dragHandle(1);
  if (await page.locator("#annular-message").getAttribute("data-state") !== "error") {
    priorPath = await forward.getAttribute("d");
    await dragHandle(2);
  }
  await expect(page.locator("#annular-message")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#annular-message")).toContainText("Curve change rejected");
  expect(await forward.getAttribute("d")).toBe(priorPath);
});
