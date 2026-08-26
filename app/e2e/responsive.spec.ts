import { expect, test } from "@playwright/test";

const AUDITED_WIDTHS = [1_200, 800, 520, 500, 430, 391, 375, 320] as const;

test("annular controls remain distinct, contained, and stateful at every audited viewport", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[name="surface-mode"][value="annular"]').check();
  await page.locator("#annular-input").fill("(1 3)(2 4)");
  await page.locator("#annular-p").fill("2");
  await page.locator("#annular-q").fill("2");
  await page.locator("#direction-toggle").check();

  for (const width of AUDITED_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator("#annular-form").evaluate((form) => {
      const bounds = (selector: string) => {
        const rect = form.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
        if (!rect) throw new Error(`Missing ${selector}`);
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const formRect = form.getBoundingClientRect();
      return {
        form: { left: formRect.left, right: formRect.right },
        random: bounds("#annular-random-button"),
        render: bounds('button[type="submit"]'),
        p: bounds("#annular-p"),
        q: bounds("#annular-q"),
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    const overlaps = !(layout.random.right <= layout.render.left || layout.render.right <= layout.random.left || layout.random.bottom <= layout.render.top || layout.render.bottom <= layout.random.top);
    expect(overlaps, `${width}px random/render overlap`).toBe(false);
    expect(layout.random.width, `${width}px random button collapsed`).toBeGreaterThan(0);
    expect(layout.render.width, `${width}px render button collapsed`).toBeGreaterThan(0);
    expect(layout.p.width, `${width}px p field collapsed`).toBeGreaterThan(0);
    expect(layout.q.width, `${width}px q field collapsed`).toBeGreaterThan(0);
    expect(layout.form.left, `${width}px form escapes left viewport`).toBeGreaterThanOrEqual(0);
    expect(layout.form.right, `${width}px form escapes right viewport`).toBeLessThanOrEqual(layout.viewportWidth + 0.5);
    expect(layout.scrollWidth, `${width}px horizontal overflow`).toBeLessThanOrEqual(layout.viewportWidth);
    await expect(page.locator("#annular-input")).toHaveValue("(1 3)(2 4)");
    await expect(page.locator("#annular-p")).toHaveValue("2");
    await expect(page.locator("#annular-q")).toHaveValue("2");
    await expect(page.locator("#direction-toggle")).toBeChecked();
  }
});
