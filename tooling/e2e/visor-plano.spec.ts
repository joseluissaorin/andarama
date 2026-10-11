import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Plano del recorrido de punta a punta, como lo usa un profesor: en el
 * Studio sube la imagen del plano, coloca las escenas encima (pulsando y
 * arrastrando) y publica; en el visor publicado abre el plano con el botón
 * del mapa, salta de escena pulsando un punto, oculta los puntos, lo cierra,
 * y lo mismo con el teclado y en un móvil.
 *
 * Depende de la cuenta y del panorama que crea studio.spec.ts (los ficheros
 * se ejecutan en orden alfabético, con un solo proceso, contra el mismo
 * servidor).
 */

test.describe.configure({ mode: "serial" });

const EMAIL = "e2e@andarama.test";
const PASSWORD = "password-e2e-123";
const SLUG = "plano-e2e";
const ESCENAS = ["Entrada E2E", "Sala E2E", "Patio E2E"];

let sessionCookies: Awaited<ReturnType<ReturnType<Page["context"]>["cookies"]>> = [];

async function login(page: Page): Promise<void> {
  if (sessionCookies.length > 0) {
    await page.context().addCookies(sessionCookies);
    return;
  }
  await page.goto("/studio/login");
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/studio/");
  sessionCookies = await page.context().cookies();
}

async function csrf(page: Page): Promise<string> {
  return (await page.context().cookies()).find((c) => c.name === "u3c")?.value ?? "";
}

/** Un plano de planta sencillo, dibujado en el navegador: tres salas y un pasillo. */
async function dibujarPlano(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 800;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f4efe4";
    ctx.fillRect(0, 0, 1200, 800);
    ctx.strokeStyle = "#5b4a3a";
    ctx.lineWidth = 8;
    ctx.strokeRect(40, 40, 1120, 720);
    ctx.fillStyle = "#cfe3c4";
    ctx.fillRect(80, 90, 440, 290);
    ctx.fillStyle = "#e9d8c0";
    ctx.fillRect(680, 90, 440, 290);
    ctx.fillStyle = "#d9e4ef";
    ctx.fillRect(420, 470, 360, 250);
    return c.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

let projectId = "";

test("el profesor sube el plano, coloca las escenas y publica", async ({ page }) => {
  await login(page);
  // Un recorrido nuevo con tres escenas del panorama que ya hay en la biblioteca
  const me = (await (await page.request.get("/api/v1/me")).json()) as { orgs: { id: string }[] };
  const orgId = me.orgs[0]!.id;
  const media = (await (await page.request.get(`/api/v1/media?org=${orgId}`)).json()) as { id: string; kind: string }[];
  const pano = media.find((m) => m.kind === "panorama")!;
  const headers = { "x-csrf-token": await csrf(page) };
  const proyecto = (await (
    await page.request.post("/api/v1/projects", { data: { orgId, title: "Plano E2E", defaultLang: "es" }, headers })
  ).json()) as { id: string };
  projectId = proyecto.id;
  for (const title of ESCENAS) {
    const res = await page.request.post(`/api/v1/projects/${projectId}/scenes`, { data: { title, mediaId: pano.id }, headers });
    expect(res.ok()).toBe(true);
  }

  // El botón «Plano del recorrido» de la lista de escenas lleva a la pantalla de los tres pasos
  await page.goto(`/studio/p/${projectId}`);
  await page.getByRole("button", { name: /Plano del recorrido/ }).click();
  await expect(page.getByRole("heading", { name: "Plano del recorrido" })).toBeVisible();
  await page.getByRole("button", { name: "Añadir plano" }).click();
  const dialogo = page.locator('[role="dialog"]');
  // Sin planos en la biblioteca, el aviso habla de planos, no de panoramas
  await expect(dialogo.getByText("Todavía no hay ningún plano.", { exact: false })).toBeVisible();
  // Subir la imagen desde ahí ya la deja puesta: el diálogo se cierra solo
  await dialogo.locator('input[type="file"]').first().setInputFiles({ name: "plano-e2e.png", mimeType: "image/png", buffer: await dibujarPlano(page) });
  await expect(dialogo).toBeHidden({ timeout: 30_000 });

  const plano = page.locator('svg[role="application"] image').first();
  await expect(plano).toBeVisible();
  const caja = (await plano.boundingBox())!;
  const punto = (fx: number, fy: number): [number, number] => [caja.x + caja.width * fx, caja.y + caja.height * fy];
  const sinColocar = (nombre: string) => page.locator("li button", { hasText: nombre });

  // 1. Pulsar la escena y después su sitio
  await sinColocar("Entrada E2E").click();
  await expect(page.getByText("Haz clic en el plano para colocar «Entrada E2E»")).toBeVisible();
  await page.mouse.click(...punto(0.25, 0.29));
  await expect(sinColocar("Entrada E2E")).toHaveCount(0);

  // 2. Arrastrarla desde la lista
  const sala = (await sinColocar("Sala E2E").boundingBox())!;
  await page.mouse.move(sala.x + 20, sala.y + sala.height / 2);
  await page.mouse.down();
  const [sx, sy] = punto(0.75, 0.29);
  await page.mouse.move(sx, sy, { steps: 12 });
  await page.mouse.up();
  await expect(sinColocar("Sala E2E")).toHaveCount(0);

  // 3. Con el teclado: Intro la pone en el centro del plano
  await sinColocar("Patio E2E").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Sin colocar", { exact: false })).toHaveCount(0);

  // Todo guardado: el tour compilado lleva el plano y las tres escenas colocadas
  await expect
    .poll(
      async () => {
        const res = await page.request.post(`/api/v1/projects/${projectId}/compile`, { data: {}, headers: { "x-csrf-token": await csrf(page) } });
        const { tour } = (await res.json()) as { tour: { floorplans?: unknown[]; scenes: { map?: { floorplan?: string } }[] } };
        return `${tour.floorplans?.length ?? 0}/${tour.scenes.filter((s) => s.map?.floorplan != null).length}`;
      },
      { timeout: 20_000 },
    )
    .toBe("1/3");

  await page.locator("header").getByRole("button", { name: /Publicar|Republicar/ }).click();
  const publicar = page.locator('[role="dialog"]', { hasText: "Publicar tour" });
  await publicar.locator("input").first().fill(SLUG);
  await publicar.getByRole("button", { name: /^(Publicar|Republicar)$/ }).click();
  await expect(publicar.locator('a[href*="/t/"]').first()).toBeVisible({ timeout: 60_000 });
});

test("en el visor publicado el plano se abre, lleva a otra escena, oculta los puntos y se cierra", async ({ page }) => {
  await page.goto(`/t/${SLUG}`);
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  const boton = page.locator(".anda-controls-left").getByRole("button", { name: "Mapa", exact: true });
  await expect(boton).toBeVisible();
  await expect(boton).toHaveAttribute("aria-expanded", "false");
  await expect(boton).toHaveAttribute("title", "Mostrar u ocultar el plano (tecla M)");

  // Poner el plano
  await boton.click();
  const panel = page.getByRole("region", { name: "Plano" });
  await expect(panel).toBeVisible();
  await expect(boton).toHaveAttribute("aria-expanded", "true");
  // El panel no tapa el botón del mapa: se puede volver a pulsar para ocultarlo
  const b = (await boton.boundingBox())!;
  const encima = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("button")?.getAttribute("aria-label"), [b.x + b.width / 2, b.y + b.height / 2]);
  expect(encima).toBe("Mapa");

  // Un punto por escena, en su sitio, y la escena actual marcada
  const puntos = panel.locator(".anda-floorplan__marker");
  await expect(puntos).toHaveCount(3);
  const entrada = panel.getByRole("button", { name: "Entrada E2E" });
  const sala = panel.getByRole("button", { name: "Sala E2E" });
  await expect(entrada).toHaveAttribute("aria-current", "true");
  const img = (await panel.locator(".anda-floorplan img").boundingBox())!;
  const cs = (await sala.boundingBox())!;
  expect((cs.x + cs.width / 2 - img.x) / img.width).toBeCloseTo(0.75, 1);
  expect((cs.y + cs.height / 2 - img.y) / img.height).toBeCloseTo(0.29, 1);

  // Pulsar un punto lleva a esa escena, y el plano marca la nueva
  await sala.click();
  await expect(sala).toHaveAttribute("aria-current", "true", { timeout: 15_000 });
  await expect(entrada).toHaveAttribute("aria-current", "false");

  // «Mostrar puntos» los quita y los vuelve a poner
  const casilla = panel.getByRole("checkbox", { name: "Mostrar puntos" });
  await expect(casilla).toBeChecked();
  await casilla.uncheck();
  await expect(puntos.first()).toBeHidden();
  await expect(panel.locator(".anda-floorplan img")).toBeVisible();
  await casilla.check();
  await expect(puntos.first()).toBeVisible();

  // El aspa de la cabecera lo cierra
  await panel.getByRole("button", { name: "Cerrar el plano" }).click();
  await expect(panel).toBeHidden();
  await expect(boton).toHaveAttribute("aria-expanded", "false");

  // Y el botón del mapa lo pone y lo quita
  await boton.click();
  await expect(panel).toBeVisible();
  await boton.click();
  await expect(panel).toBeHidden();
});

test("el plano se maneja con el teclado", async ({ page }) => {
  await page.goto(`/t/${SLUG}`);
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  const boton = page.locator(".anda-controls-left").getByRole("button", { name: "Mapa", exact: true });
  const panel = page.getByRole("region", { name: "Plano" });

  // La tecla M lo abre con el foco en el punto de la escena actual
  await page.keyboard.press("m");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Entrada E2E" })).toBeFocused();
  // Tab recorre los puntos e Intro salta a esa escena
  await page.keyboard.press("Tab");
  const otro = page.locator(":focus");
  const destino = await otro.getAttribute("aria-label");
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("button", { name: destino! })).toHaveAttribute("aria-current", "true", { timeout: 15_000 });
  // Escape lo cierra y devuelve el foco al botón del mapa
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(boton).toBeFocused();
  // Intro sobre el botón lo vuelve a abrir, y M lo cierra
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await page.keyboard.press("m");
  await expect(panel).toBeHidden();
  await expect(boton).toBeFocused();
});

test("el panel del plano abierto pasa axe sin violaciones graves", async ({ page }) => {
  await page.goto(`/t/${SLUG}`);
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.locator(".anda-controls-left").getByRole("button", { name: "Mapa", exact: true }).click();
  await expect(page.getByRole("region", { name: "Plano" })).toBeVisible();
  // A medio fundido de entrada el contraste sale falso
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .include(".anda-mappanel")
    .include(".anda-controls-left")
    .analyze();
  const graves = violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  expect(graves).toEqual([]);
});

test("en un móvil el plano se pone y se quita sin tapar el botón", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-ES" });
  const page = await ctx.newPage();
  await page.goto(`/t/${SLUG}`);
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  const boton = page.locator(".anda-controls-left").getByRole("button", { name: "Mapa", exact: true });
  const panel = page.getByRole("region", { name: "Plano" });
  await expect(panel).toBeHidden();
  await boton.tap();
  await expect(panel).toBeVisible();
  const pb = (await panel.boundingBox())!;
  const bb = (await boton.boundingBox())!;
  expect(pb.y + pb.height).toBeLessThanOrEqual(bb.y);
  expect(pb.x + pb.width).toBeLessThanOrEqual(390);
  await panel.getByRole("button", { name: "Sala E2E" }).tap();
  await expect(panel.getByRole("button", { name: "Sala E2E" })).toHaveAttribute("aria-current", "true", { timeout: 15_000 });
  await boton.tap();
  await expect(panel).toBeHidden();
  await ctx.close();
});
