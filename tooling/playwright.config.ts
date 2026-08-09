import { defineConfig } from "@playwright/test";

/**
 * E2E de flujos criticos (§4.5): crear tour -> hotspots -> publicar -> ver
 * -> exportar, contra el servidor self-host real (Node + SQLite + FS).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: process.env.CI != null ? 1 : 0,
  workers: 1,
  reporter: process.env.CI != null ? "github" : "list",
  use: {
    baseURL: "http://localhost:8799",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
    locale: "es-ES",
  },
  webServer: {
    command:
      "DATA_DIR=/tmp/ull360-e2e-$RANDOM PORT=8799 ASSETS_DIR=../apps/studio/dist-root npx tsx ../apps/api/src/node.ts",
    cwd: __dirname,
    url: "http://localhost:8799/api/v1/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
