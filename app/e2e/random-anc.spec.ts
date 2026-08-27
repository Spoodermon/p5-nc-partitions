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
