import { defineConfig } from "@playwright/test";

/**
 * LTI 1.3 de punta a punta contra un Moodle real (tooling/lti-moodle).
 *
 * No corre en CI: necesita el Moodle de docker-compose.yml levantado y
 * preparado (ver README.md). Andarama lo arranca Playwright en el anfitrión
 * con PUBLIC_URL=http://andarama.test:8795; el navegador resuelve ese nombre
 * a 127.0.0.1 y el contenedor de Moodle, al anfitrión (host-gateway).
 */
const ANDARAMA_PORT = 8795;

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts$/,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "./test-results",
  use: {
    trace: "retain-on-failure",
    actionTimeout: 20_000,
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
    locale: "es-ES",
    channel: "chromium",
    launchOptions: {
      args: [
        "--host-resolver-rules=MAP andarama.test 127.0.0.1",
        // Andarama y Moodle van por http en la prueba; en producción van por
        // https. Sin contexto seguro el Studio no tiene crypto.subtle (hash de
        // subidas), así que se tratan como si lo fueran.
        `--unsafely-treat-insecure-origin-as-secure=http://andarama.test:${ANDARAMA_PORT},http://localhost:8080`,
      ],
    },
  },
  webServer: {
    command:
      `DATA_DIR=/tmp/anda-lti-moodle-$RANDOM PORT=${ANDARAMA_PORT} PUBLIC_URL=http://andarama.test:${ANDARAMA_PORT} ` +
      "APP_SECRET=secreto-de-pruebas-lti-moodle-0123456789 ASSETS_DIR=../studio/dist-root " +
      "pnpm --filter @andarama/api exec tsx src/node.ts",
    cwd: __dirname,
    url: `http://localhost:${ANDARAMA_PORT}/api/v1/health`,
    reuseExistingServer: process.env.ANDA_REUSE === "1",
    // Los registros del servidor (errores de AGS incluidos) salen con la prueba
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  },
});
