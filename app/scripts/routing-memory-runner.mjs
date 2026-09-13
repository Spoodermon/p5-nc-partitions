import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const directory = mkdtempSync(join(tmpdir(), "pv-routing-memory-"));
try {
  // Compile outside the measured process. Vite's loader has a large,
  // platform-dependent baseline that is unrelated to routing allocations.
  await build({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    publicDir: false,
    logLevel: "silent",
    build: {
      ssr: fileURLToPath(new URL("./routing-memory-entry.ts", import.meta.url)),
      outDir: directory,
      emptyOutDir: false,
      minify: false,
      rollupOptions: { output: { entryFileNames: "routing-memory-api.mjs" } },
    },
  });
  const child = spawnSync(process.execPath, [
    "--expose-gc",
    fileURLToPath(new URL("./routing-memory-worker.mjs", import.meta.url)),
    process.argv[2],
    join(directory, "routing-memory-api.mjs"),
  ], { encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 110_000 });
  if (child.error) throw child.error;
  process.stdout.write(child.stdout);
  process.stderr.write(child.stderr);
  process.exitCode = child.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
