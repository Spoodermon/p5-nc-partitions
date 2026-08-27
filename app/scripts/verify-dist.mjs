import { readdir, readFile } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);

async function filesBelow(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await filesBelow(new URL(`${entry.name}/`, directory), `${relative}/`));
    else files.push(relative);
  }
  return files;
}

const files = await filesBelow(dist);
const htmlFiles = files.filter((file) => file.endsWith(".html"));
if (htmlFiles.length !== 1 || htmlFiles[0] !== "index.html") throw new Error(`Production build contains unexpected HTML entries: ${htmlFiles.join(", ")}`);
if (files.some((file) => file.startsWith("dev/"))) throw new Error("Production build contains developer laboratory assets");
if (!files.includes("licenses/embedded-fonts-OFL-1.1.txt")) throw new Error("Production build is missing the embedded-font license notices");
const html = await readFile(new URL("index.html", dist), "utf8");
if (/\b(?:src|href)=["']\/assets\//.test(html)) throw new Error("Production build contains root-relative /assets paths");
if (!html.includes("/p5-nc-partitions/assets/")) throw new Error("Production build does not use the GitHub project-site base");
const bundledText = (await Promise.all(files
  .filter((file) => /\.(?:css|html|js)$/.test(file))
  .map((file) => readFile(new URL(file, dist), "utf8")))).join("\n");
if (/fonts\.(?:googleapis|gstatic)\.com/.test(bundledText)) throw new Error("Production build still depends on remote Google Fonts");
if ((bundledText.match(/data:font\/woff2;base64,/g) ?? []).length < 3) throw new Error("Production build does not contain all three local/export font data sets");
process.stdout.write("Verified production entry set and GitHub Pages asset base in dist/index.html\n");
