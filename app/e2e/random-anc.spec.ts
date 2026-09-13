import { expect, test } from "@playwright/test";

test("Random ANC emits a strict connected annular-noncrossing permutation", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.999999; });
  await page.goto("/");
  await page.locator('input[name="surface-mode"][value="annular"]').check();
  await page.locator("#annular-p").fill("1");
  await page.locator("#annular-q").fill("1");
  await page.locator("#annular-random-button").click();

  await expect(page.locator("#annular-message")).toHaveAttribute("data-state", "valid");
  await expect(page.locator('input[name="annular-input-interpretation"][value="strict-permutation"]')).toBeChecked();
  await expect(page.locator("#annular-input")).toHaveValue("(1 2)");
});

test("Random ANC distribution defaults to sparse for large support until explicitly chosen", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[name="surface-mode"][value="annular"]').check();
  await expect(page.locator("#annular-random-distribution")).toHaveValue("balanced");
  await page.locator("#annular-p").fill("8");
  await page.locator("#annular-q").fill("4");
  await expect(page.locator("#annular-random-distribution")).toHaveValue("sparse");
  await page.locator("#annular-random-distribution").selectOption("dense");
  await page.locator("#annular-p").fill("2");
  await page.locator("#annular-q").fill("2");
  await expect(page.locator("#annular-random-distribution")).toHaveValue("dense");
});

test("Random ANC can enforce a fixed-point-free result without relaxing the constraint", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.999999; });
  await page.goto("/");
  await page.locator('input[name="surface-mode"][value="annular"]').check();
  await page.locator("#annular-p").fill("4");
  await page.locator("#annular-q").fill("3");
  await page.locator("#annular-exclude-singletons").check();
  await page.locator("#annular-random-button").click();

  await expect(page.locator("#annular-message")).toHaveAttribute("data-state", "valid");
  await expect(page.locator("#annular-message")).toContainText("singleton-free");
  const notation = await page.locator("#annular-input").inputValue();
  const cycles = [...notation.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]?.trim().split(/\s+/) ?? []);
  expect(cycles.length).toBeGreaterThan(0);
  expect(cycles.every((cycle) => cycle.length >= 2)).toBe(true);
  await expect(page.locator('input[name="annular-input-interpretation"][value="strict-permutation"]')).toBeChecked();
});
