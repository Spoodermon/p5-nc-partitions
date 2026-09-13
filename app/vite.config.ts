import { defineConfig } from "vite";

export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview ? "/p5-nc-partitions/" : "/",
}));
