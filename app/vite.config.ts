import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/p5-nc-partitions/" : "/",
  build: {
    rollupOptions: {
      input: {
        main: new URL("./index.html", import.meta.url).pathname,
        annularGeometry: new URL("./dev/annular-geometry.html", import.meta.url).pathname,
        annularRouting: new URL("./dev/annular-routing.html", import.meta.url).pathname,
      },
    },
  },
}));
