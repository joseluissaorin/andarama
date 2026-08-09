import { expect, test, type Page } from "@playwright/test";

/**
 * Flujo critico E2E: registro -> subida de panorama (tiler en navegador) ->
 * crear tour -> escena -> hotspot -> publicar -> visor publico -> export.
 */

test.describe.configure({ mode: "serial" });

const EMAIL = "e2e@ull360.test";
const PASSWORD = "password-e2e-123";

/** Genera un panorama equirect sintetico en el navegador y lo inyecta en el input de subida. */
async function uploadSyntheticPano(page: Page, name: string, label: string, hue: number): Promise<void> {
  await page.evaluate(
    async ({ name, label, hue }) => {
      const W = 2048;
      const H = 1024;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d")!;
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, `hsl(${hue}, 65%, 70%)`);
      grad.addColorStop(1, `hsl(${(hue + 40) % 360}, 30%, 25%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 120px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, W / 2, H / 2);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.85));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], name, { type: "image/jpeg" }));
      const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { name, label, hue },
  );
}

test("registro del primer usuario", async ({ page }) => {
  await page.goto("/studio/register");
  await page.fill("#name", "Usuario E2E");
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/studio/");
  await expect(page.getByText("Nuevo tour").first()).toBeVisible();
});

test("subida de panorama con tiling en el navegador", async ({ page }) => {
  await login(page);
  await page.goto("/studio/media");
  await page.waitForSelector('input[type="file"]', { state: "attached" });
  await uploadSyntheticPano(page, "pano-e2e.jpg", "E2E", 200);
  // Esperar a que el medio aparezca como panorama listo con tiles generados
  await expect(page.getByText("pano-e2e.jpg")).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(
      async () => {
        const me = (await (await page.request.get("/api/v1/me")).json()) as { orgs: { id: string }[] };
        const items = (await (await page.request.get(`/api/v1/media?org=${me.orgs[0]!.id}`)).json()) as {
          kind: string;
          status: string;
          derivatives: { kind: string }[];
        }[];
        const pano = items.find((m) => m.kind === "panorama");
        return pano != null && pano.status === "ready" && pano.derivatives.some((d) => d.kind === "tiles");
      },
      { timeout: 60_000 },
    )
    .toBe(true);
});

test("crear tour, escena, hotspot y publicar", async ({ page }) => {
  await login(page);
  await page.goto("/studio/");
  await page.getByRole("button", { name: "Nuevo tour" }).first().click();
  await page.fill("#np-title", "Tour E2E");
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await page.waitForURL("**/studio/p/**");

  // Añadir escena con el panorama subido
  await page.locator('button[aria-label="Añadir escena"]').click();
  await page.fill("#ns-title", "Escena E2E");
  const sceneDialog = page.locator('[role="dialog"]', { hasText: "Añadir escena" });
  await sceneDialog.getByRole("button", { name: "Elegir de la biblioteca" }).click();
  const picker = page.locator('[role="dialog"]', { hasText: "Elegir de la biblioteca" }).last();
  await picker.getByRole("button", { name: /pano-e2e\.jpg/ }).click();
  await sceneDialog.getByRole("button", { name: "Crear", exact: true }).click();

  // La vista previa WYSIWYG monta el visor real
  await expect(page.locator(".ull360-viewer canvas").first()).toBeVisible({ timeout: 30_000 });

  // Texto alternativo de la escena (accesibilidad)
  await page.fill("#sc-alt", "Escena de prueba E2E");

  // Colocar un hotspot de texto haciendo clic sobre el panorama
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page.locator(".ull360-viewer").first().click({ position: { x: 500, y: 350 } });
  await page.fill("#hs-label", "Panel E2E");
  await page.fill("#hs-body", "Contenido **markdown** de prueba");
  await page.fill("#hs-alt", "Panel de prueba");

  // Esperar autosave y publicar
  await expect(page.getByText("Guardado").first()).toBeVisible({ timeout: 15_000 });
  await page.locator("header").getByRole("button", { name: "Publicar" }).click();
  const publishDialog = page.locator('[role="dialog"]', { hasText: "Publicar tour" });
  await publishDialog.getByRole("button", { name: "Publicar", exact: true }).click();
  const link = publishDialog.locator('a[href*="/t/"]');
  await expect(link).toBeVisible({ timeout: 30_000 });
});

test("visor publico: navegacion, panel y deep link", async ({ page }) => {
  await page.goto("/t/tour-e2e");
  await expect(page.locator(".ull360-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".ull360-title")).toHaveText("Tour E2E");
  // Abrir el panel de texto
  await page.locator('.ull360-hotspot[aria-label*="Panel E2E"]').click();
  await expect(page.locator(".ull360-panel")).toContainText("markdown");
  await page.keyboard.press("Escape");
  // Deep link presente en la URL
  await expect.poll(() => page.url()).toContain("#s=");
  // Modo accesible
  await page.locator('button[aria-label="Versión accesible"]').click();
  await expect(page.locator(".ull360-accessible")).toContainText("Escena E2E");
});

test("tour.json publicado es valido y estatico", async ({ request }) => {
  const res = await request.get("/t/tour-e2e/tour.json");
  expect(res.ok()).toBeTruthy();
  const tour = await res.json();
  expect(tour.version).toBe(1);
  expect(tour.scenes.length).toBe(1);
  expect(tour.scenes[0].hotspots.length).toBe(1);
});

async function login(page: Page): Promise<void> {
  await page.goto("/studio/login");
  // Si ya hay sesion, redirige solo
  if (page.url().endsWith("/studio/")) return;
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/studio/");
}
