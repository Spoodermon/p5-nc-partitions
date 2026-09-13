import { expect, test } from "@playwright/test";

const NOTATION = "(1 2 3 5 7 8 12)(4)(6)(9 11)(10)";

test("embedded disc two-cycles keep separate clickable edges and a genuine ribbon fill", async ({ page }) => {
  await page.goto("/");
  await page.locator("#disc-input").fill(NOTATION);
  await page.locator("#disc-form").getByRole("button", { name: "Render" }).click();
  await page.locator(".color-controls summary").click();
  await page.locator("#ribbon-fill-toggle").check();
  await page.locator("#direction-toggle").check();

  const twoCyclePaths = page.locator('[data-layer="edges"] [data-cycle="(9 11)"]');
  await expect(twoCyclePaths).toHaveCount(2);
  const geometry = await twoCyclePaths.evaluateAll((paths) => paths.map((element) => {
    const path = element as SVGPathElement;
    const midpoint = path.getPointAtLength(path.getTotalLength() / 2);
    const screenPoint = midpoint.matrixTransform(path.getScreenCTM() ?? new DOMMatrix());
    return {
      role: path.getAttribute("data-role"),
      local: { x: midpoint.x, y: midpoint.y },
      screen: { x: screenPoint.x, y: screenPoint.y },
    };
  }));
  const forward = geometry.find(({ role }) => role === "forward");
  const reverse = geometry.find(({ role }) => role === "return");
  if (!forward || !reverse) throw new Error("Missing directed two-cycle paths");
  expect(Math.hypot(forward.local.x - reverse.local.x, forward.local.y - reverse.local.y)).toBeGreaterThanOrEqual(11.9);

  const fillContainsLane = await page.locator('[data-cycle-fill="3"]').evaluate((element, points) => {
    const fill = element as SVGPathElement;
    const between = new DOMPoint(
      (points.forward.x + points.reverse.x) / 2,
      (points.forward.y + points.reverse.y) / 2,
    );
    return fill.isPointInFill(between);
  }, { forward: forward.local, reverse: reverse.local });
  expect(fillContainsLane).toBe(true);

  await page.mouse.click(forward.screen.x, forward.screen.y);
  await expect(page.locator("#selection-output")).toHaveText(/edge: 9 → 11 · role: forward/);
  await page.mouse.click(reverse.screen.x, reverse.screen.y);
  await expect(page.locator("#selection-output")).toHaveText(/edge: 11 → 9 · role: return/);
});
