import { expect, test } from "@playwright/test";

const AUDITED_WIDTHS = [1_200, 800, 520, 500, 430, 391, 375, 320] as const;

test("annular controls remain distinct, contained, and stateful at every audited viewport", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[name="surface-mode"][value="annular"]').check();
  await page.locator("#annular-input").fill("(1 3)(2 4)");
  await page.locator("#annular-p").fill("2");
  await page.locator("#annular-q").fill("2");
  await page.locator("#annular-exclude-singletons").check();
  await page.locator("#direction-toggle").check();
  await expect(page.locator("#annular-view-toggle #direction-toggle")).toBeVisible();
  await expect(page.locator("#direction-control")).toContainText("Directed");
  const annularControlOrder = await page.locator("#annular-controls").locator(":scope > *").evaluateAll((elements) => elements.slice(0, 3).map((element) =>
    element.id === "annular-form" ? "form"
      : element.id === "annular-view-toggle" ? "show"
        : element.classList.contains("interpretation-toggle") ? "interpretation"
          : "unknown",
  ));
  expect(annularControlOrder).toEqual(["form", "show", "interpretation"]);
  const annularFormOrder = await page.locator("#annular-form").locator(":scope > *").evaluateAll((elements) => elements.map((element) =>
    element instanceof HTMLLabelElement && element.htmlFor === "annular-p" ? "p"
      : element instanceof HTMLLabelElement && element.htmlFor === "annular-q" ? "q"
        : element.classList.contains("annular-distribution") ? "distribution"
          : element instanceof HTMLButtonElement && element.id === "annular-random-button" ? "random"
            : element instanceof HTMLLabelElement && element.classList.contains("annular-notation") ? "permutation"
              : element instanceof HTMLButtonElement && element.type === "submit" ? "render"
                : "unknown",
  ));
  expect(annularFormOrder).toEqual(["p", "q", "distribution", "random", "permutation", "render"]);

  for (const width of AUDITED_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator("#annular-controls").evaluate((controls) => {
      const bounds = (selector: string) => {
        const rect = controls.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
        if (!rect) throw new Error(`Missing ${selector}`);
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const form = controls.querySelector<HTMLFormElement>("#annular-form");
      if (!form) throw new Error("Missing #annular-form");
      const formRect = form.getBoundingClientRect();
      return {
        form: { left: formRect.left, right: formRect.right },
        random: bounds("#annular-random-button"),
        render: bounds('button[type="submit"]'),
        p: bounds("#annular-p"),
        q: bounds("#annular-q"),
        distribution: bounds("#annular-random-distribution"),
        permutation: bounds("#annular-input"),
        show: bounds("#annular-view-toggle"),
        interpretation: bounds(".interpretation-toggle"),
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        disclosureHeights: [...document.querySelectorAll<HTMLElement>(".settings-disclosure summary")]
          .map((summary) => summary.getBoundingClientRect().height),
      };
    });
    const overlaps = !(layout.random.right <= layout.render.left || layout.render.right <= layout.random.left || layout.random.bottom <= layout.render.top || layout.render.bottom <= layout.random.top);
    expect(overlaps, `${width}px random/render overlap`).toBe(false);
    expect(layout.random.width, `${width}px random button collapsed`).toBeGreaterThan(0);
    expect(layout.render.width, `${width}px render button collapsed`).toBeGreaterThan(0);
    expect(layout.p.width, `${width}px p field collapsed`).toBeGreaterThan(0);
    expect(layout.q.width, `${width}px q field collapsed`).toBeGreaterThan(0);
    expect(layout.p.width, `${width}px p field is wider than its supported-size control`).toBeLessThanOrEqual(48.5);
    expect(layout.q.width, `${width}px q field is wider than its supported-size control`).toBeLessThanOrEqual(48.5);
    expect(layout.show.width, `${width}px Show fieldset is not content-sized`).toBeLessThanOrEqual(245);
    expect(layout.distribution.width, `${width}px distribution collapsed`).toBeGreaterThanOrEqual(100);
    const visuallyBefore = (first: { right: number; top: number; bottom: number }, second: { left: number; top: number }) =>
      first.bottom <= second.top + 0.5 || (Math.abs(first.top - second.top) <= 0.5 && first.right <= second.left + 0.5);
    expect(visuallyBefore(layout.show, layout.interpretation), `${width}px Show does not precede interpretation controls`).toBe(true);
    expect(layout.disclosureHeights.every((height) => height >= 40), `${width}px disclosure target is too short`).toBe(true);
    expect(layout.form.left, `${width}px form escapes left viewport`).toBeGreaterThanOrEqual(0);
    expect(layout.form.right, `${width}px form escapes right viewport`).toBeLessThanOrEqual(layout.viewportWidth + 0.5);
    expect(layout.scrollWidth, `${width}px horizontal overflow`).toBeLessThanOrEqual(layout.viewportWidth);
    await expect(page.locator("#annular-input")).toHaveValue("(1 3)(2 4)");
    await expect(page.locator("#annular-p")).toHaveValue("2");
    await expect(page.locator("#annular-q")).toHaveValue("2");
    await expect(page.locator("#annular-exclude-singletons")).toBeChecked();
    await expect(page.locator("#annular-random-distribution")).toHaveValue("balanced");
    await expect(page.locator("#direction-toggle")).toBeChecked();
  }

  await page.locator('input[name="surface-mode"][value="disc"]').check();
  await expect(page.locator("#disc-view-toggle #direction-toggle")).toBeVisible();
  await expect(page.locator("#direction-toggle")).toBeChecked();
  await page.locator('input[name="surface-mode"][value="annular"]').check();
  await expect(page.locator("#annular-view-toggle #direction-toggle")).toBeVisible();
  await expect(page.locator("#direction-toggle")).toBeChecked();
});

test("disc support size stays compact at every audited viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#disc-view-toggle #direction-toggle")).toBeVisible();
  await expect(page.locator("#disc-form").locator(":scope > *")).toHaveCount(4);
  const controlOrder = await page.locator("#disc-form").locator(":scope > *").evaluateAll((elements) => elements.map((element) =>
    element instanceof HTMLLabelElement && element.classList.contains("support-size-control") ? "n"
      : element instanceof HTMLButtonElement && element.id === "disc-random-button" ? "random"
        : element instanceof HTMLLabelElement && element.classList.contains("disc-notation") ? "partition"
          : element instanceof HTMLButtonElement && element.type === "submit" ? "render"
            : "unknown",
  ));
  expect(controlOrder).toEqual(["n", "random", "partition", "render"]);
  for (const width of AUDITED_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const input = page.locator("#disc-n");
    await expect(input).toBeVisible();
    const alignment = await page.locator("#disc-controls").evaluate((controls) => {
      const bounds = (selector: string) => {
        const rect = controls.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
        if (!rect) throw new Error(`Missing ${selector}`);
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
      };
      return {
        input: bounds("#disc-n"),
        random: bounds("#disc-random-button"),
        partition: bounds(".disc-notation"),
        render: bounds('button[type="submit"]'),
        show: bounds("#disc-view-toggle"),
        label: bounds(".support-size-label"),
      };
    });
    expect(alignment.input.width, `${width}px n field width`).toBeLessThanOrEqual(48.5);
    expect(Math.abs(alignment.input.bottom - alignment.random.bottom), `${width}px n/random bottom alignment`).toBeLessThanOrEqual(0.5);
    const before = (first: { right: number; top: number; bottom: number }, second: { left: number; top: number }) =>
      first.bottom <= second.top + 0.5 || (Math.abs(first.top - second.top) <= 0.5 && first.right <= second.left + 0.5);
    expect(before(alignment.input, alignment.random), `${width}px n precedes Random NC`).toBe(true);
    expect(before(alignment.random, alignment.partition), `${width}px Random NC precedes Partition`).toBe(true);
    expect(before(alignment.partition, alignment.render), `${width}px Partition precedes Render`).toBe(true);
    expect(alignment.show.top + 0.5, `${width}px Show remains at or after the form row`).toBeGreaterThanOrEqual(alignment.input.top);
    expect(Math.abs((alignment.label.left + alignment.label.right) / 2 - (alignment.input.left + alignment.input.right) / 2), `${width}px n label centering`).toBeLessThanOrEqual(0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px horizontal overflow`).toBeLessThanOrEqual(width);
  }
});
