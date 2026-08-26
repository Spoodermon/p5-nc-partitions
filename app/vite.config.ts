import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/p5-nc-partitions/" : "/",
}));
