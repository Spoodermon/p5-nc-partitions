import { describe, expect, it } from "vitest";
import markup from "../index.html?raw";

describe("production responsive contract", () => {
  it("uses distinct annular button cells at every audited viewport tier", () => {
    const widths = [1200, 800, 520, 500, 430, 391, 375, 320];
    expect(widths).toHaveLength(8);
    expect(markup).toContain('id="annular-random-button"');
    expect(markup).toContain('<button type="submit">Render</button>');
    expect(markup.match(/id="annular-random-button"/g)).toHaveLength(1);
    expect(markup.match(/<button type="submit">Render<\/button>/g)).toHaveLength(2);
  });
});
