import { readFile } from "node:fs/promises";
import { expect, test, type Page, type Route } from "@playwright/test";

async function annular(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("radio", { name: "Annular", exact: true }).check();
  await page.locator("#annular-p").fill("2");
  await page.locator("#annular-q").fill("2");
}

test("canonical block input is invariant across distinct valid orientations", async ({ page }) => {
  await annular(page);
  await page.locator('[name="annular-input-interpretation"][value="canonical-blocks"]').check();
  for (const notation of ["(1 2 3 4)", "(1 2 4 3)"]) {
    await page.locator("#annular-input").fill(notation);
    await page.locator("#annular-form button[type=submit]").click();
    await expect(page.locator("#routing-progress")).toBeHidden();
    await expect(page.locator("#figure svg title")).toHaveText("(1 2 3 4), annular permutation (2,2)");
    await expect(page.locator("#annular-input")).toHaveValue(notation);
  }
});

test("annular syntax, crossing and routing errors survive cosmetic redraws", async ({ page }) => {
  await annular(page);
  for (const notation of ["(", "(1 3 2 4)"]) {
    await page.locator("#annular-input").fill(notation);
    await page.locator("#annular-form button[type=submit]").click();
    const message = page.locator("#annular-message");
    await expect(message).toHaveAttribute("data-state", "error");
    const text = await message.textContent();
    await page.locator("#direction-toggle").setChecked(!(await page.locator("#direction-toggle").isChecked()));
    await expect(message).toHaveText(text!);
    await expect(message).toHaveAttribute("data-state", "error");
  }
  await page.locator("#annular-p").fill("12");
  await page.locator("#annular-q").fill("12");
  await page.locator("#annular-input").fill(`(${Array.from({ length: 24 }, (_, index) => index + 1).join(" ")})`);
  await page.locator("#annular-form button[type=submit]").click();
  await expect(page.locator("#annular-message")).toHaveAttribute("data-state", "error");
  const rejection = await page.locator("#annular-message").textContent();
  await page.locator("#direction-toggle").setChecked(!(await page.locator("#direction-toggle").isChecked()));
  await expect(page.locator("#annular-message")).toHaveText(rejection!);
});

test("dense disc lanes remain visible and long captions fit live and exported SVGs", async ({ page, context }) => {
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.goto("/");
  const notation = Array.from({ length: 33 }, (_, index) => `(${index * 2 + 1} ${index * 2 + 2})`).join("");
  await page.locator("#disc-input").fill(notation);
  await page.locator("#disc-form button[type=submit]").click();
  await expect(page.locator("#figure svg")).toHaveAttribute("data-presentation", "curved");
  const gap = await page.locator("#figure svg").evaluate((svg) => {
    const paths = svg.querySelectorAll<SVGPathElement>(".permutation-edge");
    const a = paths[0]!.getPointAtLength(paths[0]!.getTotalLength() / 2);
    const b = paths[1]!.getPointAtLength(paths[1]!.getTotalLength() / 2);
    return Math.hypot(a.x - b.x, a.y - b.y) * svg.getBoundingClientRect().width / 1000;
  });
  expect(gap).toBeGreaterThan(3.4);
  const caption = page.locator("[data-diagram-caption]");
  await expect(page.locator("[data-full-notation]")).toHaveText(notation);
  const bounds = await caption.evaluate((node) => { const b = (node as SVGGraphicsElement).getBBox(); return { x: b.x, right: b.x + b.width }; });
  expect(bounds.x).toBeGreaterThanOrEqual(49);
  expect(bounds.right).toBeLessThanOrEqual(951);
  await page.locator("#export-button").focus();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const source = await readFile((await (await downloadPromise).path())!, "utf8");
  const exported = await context.newPage();
  await exported.setContent(source.replace(/<\?xml[^>]*>/, ""));
  await expect(exported.locator("[data-full-notation]")).toHaveText(notation);
  for (const width of [350, 700, 1000]) {
    await exported.locator("svg").first().evaluate((svg, size) => { svg.setAttribute("width", String(size)); svg.setAttribute("height", String(size)); }, width);
    const effect = await exported.locator(".permutation-edge").first().evaluate((edge) => getComputedStyle(edge).vectorEffect);
    expect(effect).toBe("non-scaling-stroke");
    const exportedBounds = await exported.locator("[data-diagram-caption]").evaluate((node) => { const b = (node as SVGGraphicsElement).getBBox(); return { x: b.x, right: b.x + b.width }; });
    expect(exportedBounds.x).toBeGreaterThanOrEqual(49);
    expect(exportedBounds.right).toBeLessThanOrEqual(951);
  }
  await exported.close();
  await page.locator("#disc-input").fill(Array.from({ length: 65 }, (_, index) => `(${index + 1})`).join(""));
  await page.locator("#disc-form button[type=submit]").click();
  const loopHeight = await page.locator(".permutation-edge").first().evaluate((node) => (node as SVGGraphicsElement).getBBox().height);
  expect(loopHeight).toBeGreaterThan(20);
});

test("compact disc fallback stays explicit after display changes", async ({ page }) => {
  await page.goto("/");
  await page.locator("#disc-input").fill(Array.from({ length: 200 }, (_, index) => `(${index + 1} ${400 - index})`).join(""));
  await page.locator("#disc-form button[type=submit]").click();
  await expect(page.locator("#figure svg")).toHaveAttribute("data-presentation", "compact");
  await expect(page.locator("#disc-message")).toContainText("Compact diagram");
  await page.locator("#direction-toggle").check();
  await expect(page.locator("#disc-message")).toContainText("Compact diagram");
});

test("pending routing stays responsive, can be cancelled, and can be superseded", async ({ page }) => {
  await annular(page);
  const original = await page.locator("#figure svg title").textContent();
  const held: Route[] = [];
  await page.route("**/annular.worker.ts*", (route) => { held.push(route); });
  await page.locator("#annular-input").fill("(1 3)(2 4)");
  await page.locator("#annular-form button[type=submit]").click();
  await expect(page.locator("#routing-progress")).toBeVisible();
  await page.locator("#direction-toggle").check();
  await expect(page.locator("#export-button")).toBeDisabled();
  await expect(page.locator("#annular-message")).toHaveAttribute("data-state", "pending");
  await page.locator("#cancel-routing-button").click();
  await expect(page.locator("#routing-progress")).toBeHidden();
  await expect(page.locator("#export-button")).toBeEnabled();
  await expect(page.locator("#figure svg title")).toHaveText(original!);
  await page.locator("#annular-form button[type=submit]").click();
  await expect(page.locator("#routing-progress")).toBeVisible();
  await page.unroute("**/annular.worker.ts*");
  await page.locator("#annular-input").fill("(1 2 3 4)");
  await page.locator("#annular-form button[type=submit]").click();
  await expect(page.locator("#figure svg title")).toHaveText("(1 2 3 4), annular permutation (2,2)");
  for (const route of held) await route.abort().catch(() => {});
});
