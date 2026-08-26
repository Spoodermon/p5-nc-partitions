import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
if (/\b(?:src|href)=["']\/assets\//.test(html)) throw new Error("Production build contains root-relative /assets paths");
if (!html.includes("/p5-nc-partitions/assets/")) throw new Error("Production build does not use the GitHub project-site base");
process.stdout.write("Verified GitHub Pages asset base in dist/index.html\n");
