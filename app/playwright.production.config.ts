import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-production",
  workers: 1,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:4174/p5-nc-partitions/", browserName: "chromium", headless: true },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174/p5-nc-partitions/",
    reuseExistingServer: false,
  },
});
