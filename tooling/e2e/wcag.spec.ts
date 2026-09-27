import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Accesibilidad (WCAG 2.1 AA) con axe-core: recorre la web pública, el visor
 * publicado y las pantallas principales del Studio, y falla con cualquier
 * violación grave o crítica. Las moderadas y leves se escriben en la salida
 * para revisarlas, pero no rompen la prueba.
 *
 * Depende del tour publicado por studio.spec.ts (los ficheros se ejecutan en
 * orden alfabético, con un solo proceso, contra el mismo servidor).
 *
 * axe solo caza una parte de los problemas: la navegación con teclado del
 * visor y de los diálogos se comprueba aparte, al final de este fichero.
 */

const EMAIL = "e2e@andarama.test";
const PASSWORD = "password-e2e-123";
const ETIQUETAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

interface Hallazgo {
  pantalla: string;
  regla: string;
  impacto: string;
  ayuda: string;
  nodos: string[];
}

const graves: Hallazgo[] = [];

/** Espera a que acaben las animaciones de entrada: a medio fundido el contraste sale falso. */
async function quieta(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((a) => a.effect?.getTiming().iterations !== Infinity)
      .every((a) => a.playState !== "running"),
  );
}

async function auditar(page: Page, pantalla: string, opciones: { incluir?: string } = {}): Promise<void> {
  await quieta(page);
  let builder = new AxeBuilder({ page }).withTags(ETIQUETAS);
  if (opciones.incluir != null) builder = builder.include(opciones.incluir);
  const { violations, passes } = await builder.analyze();
  // Una página en blanco no tiene violaciones: que el análisis vea contenido de verdad
  expect(passes.length, `axe no encontró nada que comprobar en ${pantalla}`).toBeGreaterThan(5);
  for (const v of violations) {
    const h: Hallazgo = {
      pantalla,
      regla: v.id,
      impacto: v.impact ?? "desconocido",
      ayuda: v.help,
      nodos: v.nodes.slice(0, 6).map((n) => `${n.target.join(" ")}  ${n.failureSummary?.split("\n").slice(1, 3).join(" ") ?? ""}`),
    };
    console.log(`[axe] ${pantalla} · ${h.impacto} · ${h.regla}: ${h.ayuda}\n    ${h.nodos.join("\n    ")}`);
    if (v.impact === "serious" || v.impact === "critical") graves.push(h);
  }
}

function sinGraves(pantalla: string): void {
  const aqui = graves.filter((g) => g.pantalla.startsWith(pantalla));
  expect.soft(aqui.map((g) => `${g.pantalla} · ${g.regla} (${g.impacto}): ${g.nodos.join(" | ")}`)).toEqual([]);
}

let sessionCookies: Awaited<ReturnType<ReturnType<Page["context"]>["cookies"]>> = [];

async function login(page: Page): Promise<void> {
  if (sessionCookies.length > 0) {
    await page.context().addCookies(sessionCookies);
    return;
  }
  await page.goto("/studio/login");
  if (page.url().endsWith("/studio/")) return;
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/studio/");
  sessionCookies = await page.context().cookies();
}

async function abrirTour(page: Page): Promise<string> {
  await page.goto("/studio/");
  await page.getByText("Tour E2E").first().click();
  await page.waitForURL("**/studio/p/**");
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  return page.url().split("?")[0]!;
}

test.describe("web pública", () => {
  const paginas: [string, string][] = [
    ["portada", "/"],
    ["precios", "/precios/"],
    ["formación", "/formacion/"],
    ["aula", "/aula/"],
    ["blog", "/blog/"],
    ["accesibilidad", "/accesibilidad/"],
    ["portada en inglés", "/en/"],
  ];
  for (const [nombre, ruta] of paginas) {
    test(`web: ${nombre}`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page.locator("html")).toHaveAttribute("lang", /.+/);
      await expect(page.locator("h1").first()).toBeVisible();
      await auditar(page, `web ${nombre}`);
      sinGraves(`web ${nombre}`);
    });
  }

  test("web: una entrada del blog", async ({ page }) => {
    await page.goto("/blog/");
    const enlace = page.locator("main a[href^='/blog/']:not([href='/blog/'])").first();
    await enlace.click();
    await expect(page.locator("h1").first()).toBeVisible();
    await auditar(page, "web entrada del blog");
    sinGraves("web entrada del blog");
  });
});

test.describe("visor publicado", () => {
  test("visor: escena, panel, ayuda, compartir y modo accesible", async ({ page }) => {
    await page.goto("/t/tour-e2e?v=a11y");
    await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", /^es/);
    await auditar(page, "visor escena");

    await page.locator('.anda-hotspot[aria-label*="Panel E2E"]').click();
    await expect(page.locator(".anda-panel")).toBeVisible();
    await auditar(page, "visor panel");
    await page.keyboard.press("Escape");
    await expect(page.locator(".anda-panel")).toHaveCount(0);

    // Ayuda y compartir: diálogos con nombre, foco dentro, Escape y vuelta del foco
    for (const [nombre, boton] of [
      ["ayuda", "Ayuda"],
      ["compartir", "Compartir"],
    ] as const) {
      const abridor = page.locator(`.anda-controls button[aria-label="${boton}"]`);
      await abridor.click();
      const dlg = page.getByRole("dialog", { name: boton === "Ayuda" ? /./ : boton });
      await expect(dlg).toBeVisible();
      await expect.poll(() => dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
      for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
      await expect.poll(() => dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
      await auditar(page, `visor ${nombre}`);
      await page.keyboard.press("Escape");
      await expect(page.locator(".anda-screen")).toHaveCount(0);
      await expect.poll(() => abridor.evaluate((b) => b === document.activeElement)).toBe(true);
    }

    await page.locator('button[aria-label="Versión accesible"]').click();
    await expect(page.locator(".anda-accessible")).toBeVisible();
    await auditar(page, "visor modo accesible");
    sinGraves("visor");
  });
});

test.describe("Studio", () => {
  test("Studio: acceso", async ({ page }) => {
    await page.goto("/studio/login");
    await expect(page.locator("#email")).toBeVisible();
    await auditar(page, "Studio acceso");
    sinGraves("Studio acceso");
  });

  test("Studio: proyectos, medios y planes", async ({ page }) => {
    await login(page);
    await page.goto("/studio/");
    await expect(page.getByText("Tour E2E").first()).toBeVisible();
    await auditar(page, "Studio proyectos");
    await page.goto("/studio/media");
    // La prueba de medios de studio.spec renombra la panorámica: basta con la rejilla
    await expect(page.locator("main img").first()).toBeVisible({ timeout: 15_000 });
    await auditar(page, "Studio medios");
    await page.goto("/studio/plan");
    await expect(page.locator("h1, h2").first()).toBeVisible();
    await auditar(page, "Studio planes");
    sinGraves("Studio proyectos");
    sinGraves("Studio medios");
    sinGraves("Studio planes");
  });

  test("Studio: editor y sus diálogos", async ({ page }) => {
    await login(page);
    const url = await abrirTour(page);
    await auditar(page, "Studio editor");
    // Con una escena seleccionada aparece el panel de propiedades
    await page.locator(".anda-ficha").filter({ hasText: "Escena E2E" }).first().click({ position: { x: 40, y: 20 } });
    await auditar(page, "Studio editor propiedades");
    for (const vista of ["graph", "settings", "translations", "versions", "comments"]) {
      await page.goto(`${url}?tab=${vista}`);
      await expect(page.locator("header").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      await auditar(page, `Studio editor ${vista}`);
    }
    await page.goto(url);
    await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });

    const dialogos: [string, RegExp, string][] = [
      ["publicar", /^(Publicar|Republicar)$/, "Publicar tour"],
      ["exportar", /^Exportar$/, "Exportar paquete"],
      ["compartir", /^Compartir$/, "Compartir"],
    ];
    for (const [nombre, boton, titulo] of dialogos) {
      await page.locator("header").getByRole("button", { name: boton }).first().click();
      const dlg = page.getByRole("dialog", { name: new RegExp(titulo) });
      await expect(dlg).toBeVisible();
      // El foco entra en el diálogo y no se escapa con Tab
      await expect.poll(() => dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
      for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
      await expect.poll(() => dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
      await auditar(page, `Studio diálogo ${nombre}`);
      await page.keyboard.press("Escape");
      await expect(dlg).toHaveCount(0);
    }
    sinGraves("Studio editor");
    sinGraves("Studio diálogo");
  });
});

test.describe("teclado en el visor", () => {
  test("los hotspots se alcanzan con Tab y se activan con Enter y con Espacio; Escape cierra el panel", async ({ page }) => {
    await page.goto("/t/tour-e2e?v=teclado");
    await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
    const hotspot = page.locator('.anda-hotspot[aria-label*="Panel E2E"]');
    // Llegar al hotspot tabulando, sin ratón
    let llegado = false;
    for (let i = 0; i < 60 && !llegado; i++) {
      await page.keyboard.press("Tab");
      llegado = await hotspot.evaluate((h) => h === document.activeElement);
    }
    expect(llegado).toBe(true);
    for (const tecla of ["Enter", " "]) {
      await page.keyboard.press(tecla);
      await expect(page.locator(".anda-panel")).toBeVisible();
      // El foco entra en el panel
      await expect.poll(() => page.locator(".anda-panel").evaluate((p) => p.contains(document.activeElement))).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.locator(".anda-panel")).toHaveCount(0);
      // Y vuelve al hotspot que lo abrió
      await expect.poll(() => hotspot.evaluate((h) => h === document.activeElement)).toBe(true);
    }
  });

  test("el menú de escenas cerrado no se alcanza con Tab; abierto, Escape lo cierra y devuelve el foco", async ({ page }) => {
    await page.goto("/t/tour-e2e?v=menu");
    await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
    const menu = page.locator(".anda-scenemenu");
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      expect(await menu.evaluate((m) => m.contains(document.activeElement))).toBe(false);
    }
    const boton = page.locator('.anda-topbar button[aria-label="Menú"]');
    await expect(boton).toHaveAttribute("aria-expanded", "false");
    await boton.focus();
    await page.keyboard.press("Enter");
    await expect(boton).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => menu.evaluate((m) => m.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("data-open", "false");
    await expect.poll(() => boton.evaluate((b) => b === document.activeElement)).toBe(true);
  });

  test("con movimiento reducido el visor no anima los paneles ni el menú", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/t/tour-e2e?v=movimiento");
    await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
    await page.locator('.anda-hotspot[aria-label*="Panel E2E"]').click();
    const panel = page.locator(".anda-panel");
    await expect(panel).toBeVisible();
    expect(await panel.evaluate((p) => getComputedStyle(p).animationName)).toBe("none");
    await page.keyboard.press("Escape");
    expect(await page.locator(".anda-scenemenu").evaluate((m) => getComputedStyle(m).transitionDuration)).toMatch(/^0s/);
  });

  test("con el zoom al 200 % la barra del visor sigue a mano y la web no se desborda", async ({ page }) => {
    // 1280 px a 200 % equivalen a una ventana de 640 px de ancho
    await page.setViewportSize({ width: 640, height: 450 });
    await page.goto("/t/tour-e2e?v=zoom");
    await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
    // En una ventana estrecha la barra se pliega detrás de un botón que dice
    // si está abierta; desplegada, todo vuelve a estar a la vista.
    const plegar = page.locator(".anda-controls__toggle");
    await expect(plegar).toHaveAttribute("aria-expanded", "false");
    await plegar.focus();
    await page.keyboard.press("Enter");
    await expect(plegar).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator('button[aria-label="Versión accesible"]')).toBeInViewport();
    for (const ruta of ["/", "/precios/", "/formacion/", "/aula/", "/blog/", "/accesibilidad/"]) {
      await page.goto(ruta);
      const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(desborde, `desborde horizontal en ${ruta}`).toBeLessThanOrEqual(1);
    }
  });
});
