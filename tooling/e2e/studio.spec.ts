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

  // Colocar un hotspot de texto: paleta buscable y clic sobre el panorama
  // Hay dos accesos a la paleta: el de la barra del visor y el del panel
  await page.getByRole("button", { name: /añadir hotspot/i }).first().click();
  await page.locator('[role="dialog"] input').first().fill("texto");
  await page.getByRole("button", { name: /^Texto/ }).first().click();
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

test("el grafo tiene los cuatro modos y el plano ya no es una pestaña", async ({ page }) => {
  await login(page);
  await page.goto("/studio/");
  await page.getByText("Tour E2E").first().click();
  await page.waitForURL("**/studio/p/**");
  const projectUrl = page.url().split("?")[0]!;

  await page.goto(`${projectUrl}?tab=graph`);
  const modos = page.getByRole("group", { name: "Modo del lienzo" });
  for (const modo of ["Escenas", "Plano", "Mapa", "Autopilot"]) {
    await expect(modos.getByRole("button", { name: modo, exact: true })).toBeVisible({ timeout: 20_000 });
  }
  // El plano dejó de ser una pestaña del editor
  await expect(page.locator('nav[aria-label="Vistas del editor"] button', { hasText: "Plano" })).toHaveCount(0);

  // Los enlaces antiguos siguen llevando donde llevaban
  await page.goto(`${projectUrl}?tab=floorplan`);
  await expect(page.getByRole("group", { name: "Modo del lienzo" }).getByRole("button", { name: "Plano", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
    { timeout: 20_000 },
  );
  await expect.poll(() => page.url()).toContain("mode=plan");
});

test("un área es la categoría del menú de escenas", async ({ page }) => {
  await login(page);
  await page.goto("/studio/");
  await page.getByText("Tour E2E").first().click();
  await page.waitForURL("**/studio/p/**");

  // El área se crea desde el panel del grafo...
  await page.goto(`${page.url().split("?")[0]!}?tab=graph`);
  await page.getByRole("button", { name: "Áreas", exact: true }).click();
  await page.getByRole("button", { name: "Nueva área" }).click();
  const nombre = page.getByLabel("Nombre del área").first();
  await expect(nombre).toBeVisible({ timeout: 10_000 });
  await nombre.fill("Planta baja");

  // ...y se asigna desde las propiedades de la escena
  await page.locator('nav[aria-label="Vistas del editor"]').getByRole("button", { name: "Escenas" }).click();
  await page.locator("#sc-area").selectOption({ label: "Planta baja" });
  await expect(page.getByText("Guardado").first()).toBeVisible({ timeout: 15_000 });

  // Y llega al tour publicado como categoría del menú de escenas
  await page.locator("header").getByRole("button", { name: "Republicar" }).click();
  const dialog = page.locator('[role="dialog"]', { hasText: "Publicar tour" });
  await dialog.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(dialog.locator('a[href*="/t/"]')).toBeVisible({ timeout: 30_000 });
  const tour = (await (await page.request.get("/t/tour-e2e/tour.json")).json()) as { scenes: { category?: string }[] };
  expect(tour.scenes[0]!.category).toBe("Planta baja");
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

test("web component embebible servido en /embed.js", async ({ request }) => {
  const res = await request.get("/embed.js");
  expect(res.ok()).toBeTruthy();
  const js = await res.text();
  expect(js).toContain("ull360-tour");
  expect(js).toContain("customElements.define");
});

test("medios: renombrar y asignar a tour via API", async ({ page }) => {
  await login(page);
  const me = (await (await page.request.get("/api/v1/me")).json()) as { orgs: { id: string }[] };
  const orgId = me.orgs[0]!.id;
  const items = (await (await page.request.get(`/api/v1/media?org=${orgId}`)).json()) as { id: string; filename: string }[];
  const item = items[0]!;
  const patch = await page.request.patch(`/api/v1/media/${item.id}`, {
    data: { filename: "pano-renombrado.jpg" },
    headers: { "x-csrf-token": await csrf(page) },
  });
  expect(patch.ok()).toBeTruthy();
  const after = (await (await page.request.get(`/api/v1/media?org=${orgId}`)).json()) as { id: string; filename: string }[];
  expect(after.find((m) => m.id === item.id)?.filename).toBe("pano-renombrado.jpg");
  // Un medio referenciado por una escena no puede borrarse (409)
  const del = await page.request.delete(`/api/v1/media/${item.id}`, { headers: { "x-csrf-token": await csrf(page) } });
  expect(del.status()).toBe(409);
});

test("admin: crear organizacion y usuario desde la API", async ({ page }) => {
  await login(page);
  const token = await csrf(page);
  const org = await page.request.post("/api/v1/admin/orgs", {
    data: { name: "Facultad E2E" },
    headers: { "x-csrf-token": token },
  });
  expect(org.status()).toBe(201);
  const { id: orgId } = (await org.json()) as { id: string };
  const user = await page.request.post("/api/v1/admin/users", {
    data: { email: "docente@ull360.test", name: "Docente E2E", password: "password-e2e-456", orgId },
    headers: { "x-csrf-token": token },
  });
  expect(user.status()).toBe(201);
  const list = (await (await page.request.get("/api/v1/admin/users")).json()) as { email: string }[];
  expect(list.some((u) => u.email === "docente@ull360.test")).toBeTruthy();
});

/** Token CSRF de la cookie u3c de la sesion actual. */
async function csrf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === "u3c")?.value ?? "";
}

async function login(page: Page): Promise<void> {
  await page.goto("/studio/login");
  // Si ya hay sesion, redirige solo
  if (page.url().endsWith("/studio/")) return;
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/studio/");
}
