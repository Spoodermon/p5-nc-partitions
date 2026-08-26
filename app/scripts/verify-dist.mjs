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
const html = await readFile(new URL("index.html", dist), "utf8");
if (/\b(?:src|href)=["']\/assets\//.test(html)) throw new Error("Production build contains root-relative /assets paths");
if (!html.includes("/p5-nc-partitions/assets/")) throw new Error("Production build does not use the GitHub project-site base");
process.stdout.write("Verified production entry set and GitHub Pages asset base in dist/index.html\n");
