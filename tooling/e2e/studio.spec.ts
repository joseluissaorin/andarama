import { expect, test, type Page } from "@playwright/test";

/**
 * Flujo critico E2E: registro -> subida de panorama (tiler en navegador) ->
 * crear tour -> escena -> hotspot -> publicar -> visor publico -> export.
 */

test.describe.configure({ mode: "serial" });

const EMAIL = "e2e@andarama.test";
const PASSWORD = "password-e2e-123";

/** Genera un panorama equirect sintetico en el navegador y lo inyecta en el input de subida. */
async function uploadSyntheticPano(page: Page, name: string, label: string, hue: number): Promise<void> {
  await page.evaluate(
    async ({ name, label, hue }) => {
      // A propósito **no** son potencia de dos: con 2048x1024 no se veía que
      // el troceador dejaba todas las teselas en negro para cualquier foto de
      // una cámara real, que nunca mide una potencia de dos.
      const W = 3000;
      const H = 1500;
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

test("las teselas del panorama tienen imagen, no salen en negro", async ({ page }) => {
  await login(page);
  const me = (await (await page.request.get("/api/v1/me")).json()) as { orgs: { id: string }[] };
  const items = (await (await page.request.get(`/api/v1/media?org=${me.orgs[0]!.id}`)).json()) as {
    id: string;
    kind: string;
    derivatives: { kind: string; manifest: { extension?: string; faceSize?: number } }[];
  }[];
  const pano = items.find((m) => m.kind === "panorama")!;
  const tiles = pano.derivatives.find((d) => d.kind === "tiles")!;
  await page.goto("/studio/");
  const analisis = await page.evaluate(
    async ({ id, ext }) => {
      const leer = async (ruta: string): Promise<{ status: number; colores: number; luz: number }> => {
        const res = await fetch(`/api/v1/media/${id}/tiles/${ruta}.${ext}`);
        if (!res.ok) return { status: res.status, colores: 0, luz: 0 };
        const bmp = await createImageBitmap(await res.blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        c.getContext("2d")!.drawImage(bmp, 0, 0);
        const d = c.getContext("2d")!.getImageData(0, 0, bmp.width, bmp.height).data;
        const colores = new Set<string>();
        let suma = 0;
        for (let i = 0; i < d.length; i += 4) {
          colores.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
          suma += (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
        }
        bmp.close();
        return { status: res.status, colores: colores.size, luz: suma / (d.length / 4) };
      };
      return { frente: await leer("0/f/0/0"), arriba: await leer("0/u/0/0"), abajo: await leer("0/d/0/0") };
    },
    { id: pano.id, ext: tiles.manifest.extension ?? "webp" },
  );
  expect(analisis.frente.status).toBe(200);
  // Una tesela real tiene cientos de colores; una rota, uno solo (negro)
  expect(analisis.frente.colores).toBeGreaterThan(20);
  // El panorama de prueba tiene el degradado claro arriba y oscuro abajo: si el
  // techo y el suelo se intercambian, esto lo caza.
  expect(analisis.arriba.luz).toBeGreaterThan(analisis.abajo.luz + 20);
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
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });

  // Texto alternativo de la escena (accesibilidad)
  await page.fill("#sc-alt", "Escena de prueba E2E");

  // Colocar un hotspot de texto: paleta buscable y clic sobre el panorama
  // Hay dos accesos a la paleta: el de la barra del visor y el del panel
  await page.getByRole("button", { name: /añadir hotspot/i }).first().click();
  await page.locator('[role="dialog"] input').first().fill("texto");
  await page.getByRole("button", { name: /^Texto/ }).first().click();
  await page.locator(".anda-viewer").first().click({ position: { x: 500, y: 350 } });
  await page.fill("#hs-label", "Panel E2E");
  await page.fill("#hs-body", "Contenido **markdown** de prueba");
  await page.fill("#hs-alt", "Panel de prueba");

  // Esperar autosave y publicar
  await expect(page.getByText("Guardado").first()).toBeVisible({ timeout: 15_000 });
  await page.locator("header").getByRole("button", { name: "Publicar" }).click();
  const publishDialog = page.locator('[role="dialog"]', { hasText: "Publicar tour" });
  await publishDialog.getByRole("button", { name: "Publicar", exact: true }).click();
  // El primero es el enlace publicado; debajo va el del otro modo de apertura
  const link = publishDialog.locator('a[href*="/t/"]').first();
  await expect(link).toBeVisible({ timeout: 30_000 });
  // El enlace recién publicado se copia desde aquí mismo
  await expect(publishDialog.getByRole("button", { name: "Copiar" }).first()).toBeVisible();
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

test("carpetas: crear, meter un tour dentro arrastrando y sacarlo", async ({ page }) => {
  await login(page);
  await page.goto("/studio/");

  await page.getByRole("button", { name: "Nueva carpeta" }).click();
  await page.fill("#nf-name", "Planta baja");
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  // Al crearla se entra dentro, y está vacía
  await expect(page.getByText("0 recorridos en esta carpeta")).toBeVisible({ timeout: 15_000 });

  // En la raíz aparece la carpeta junto a los tours sueltos
  await page.getByRole("button", { name: "Todos los proyectos" }).click();
  await expect(page.getByText("Planta baja").first()).toBeVisible();

  // Arrastrar el tour sobre la carpeta. Se sintetiza el arrastre HTML5 porque
  // es exactamente lo que hace el ratón, y es el gesto que se quiere probar.
  const arrastre = await page.evaluate(() => {
    const tarjetas = [...document.querySelectorAll(".grid > div")];
    const tour = tarjetas.find((d) => d.textContent?.includes("Tour E2E"));
    const carpeta = tarjetas.find((d) => d.textContent?.includes("Planta baja"));
    if (tour == null || carpeta == null) return "faltan tarjetas";
    const dt = new DataTransfer();
    tour.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true }));
    carpeta.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
    carpeta.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    return "ok";
  });
  expect(arrastre).toBe("ok");

  // Ya está dentro: la carpeta lo cuenta y deja de estar suelto
  await expect(page.getByText("1 recorrido", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByText("Planta baja").first().click();
  await expect(page.getByText("Tour E2E").first()).toBeVisible();

  // Y se saca desde el menú de la tarjeta
  await page.locator(".grid > div").first().getByRole("button", { name: "Acciones" }).click();
  await page.getByText("Sacar de la carpeta").click();
  await page.getByRole("button", { name: "Todos los proyectos" }).click();
  await expect(page.getByText("0 recorridos", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Tour E2E").first()).toBeVisible();
});

test("autopilot: pulsar escenas crea el recorrido sin ceremonia", async ({ page }) => {
  await login(page);
  await page.goto("/studio/");
  await page.getByText("Tour E2E").first().click();
  await page.waitForURL("**/studio/p/**");
  const projectUrl = page.url().split("?")[0]!;
  await page.goto(`${projectUrl}?tab=graph&mode=autopilot`);

  const modos = page.getByRole("group", { name: "Modo del lienzo" });
  await expect(modos.getByRole("button", { name: "Autopilot", exact: true })).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });

  // Sin recorridos aún: el panel lo dice y el primer clic crea la ruta
  await expect(page.getByText("Todavía no hay ningún recorrido")).toBeVisible();
  const nodo = page.getByRole("button", { name: /^Escena E2E/ }).first();
  await nodo.click();
  await expect(page.getByRole("listitem").filter({ hasText: "Escena E2E" })).toHaveCount(1, { timeout: 10_000 });
  // Otro clic añade la segunda parada (revisitar está permitido)
  await nodo.click();
  await expect(page.getByRole("listitem").filter({ hasText: "Escena E2E" })).toHaveCount(2);

  // El recorrido sobrevive a recargar: se guardó en el borrador
  await expect(page.getByText("Guardado").first()).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Escena E2E" })).toHaveCount(2, { timeout: 20_000 });
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
  await expect(dialog.locator('a[href*="/t/"]').first()).toBeVisible({ timeout: 30_000 });
  const tour = (await (await page.request.get("/t/tour-e2e/tour.json")).json()) as { scenes: { category?: string }[] };
  expect(tour.scenes[0]!.category).toBe("Planta baja");
});

test("la previsualizacion recorre el borrador y guarda la llegada", async ({ page }) => {
  await login(page);
  await page.goto("/studio/");
  await page.getByText("Tour E2E").first().click();
  await page.waitForURL("**/studio/p/**");
  const projectUrl = page.url().split("?")[0]!;

  await page.goto(`${projectUrl}?tab=preview`);
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 40_000 });
  // La barra dice donde estas y por donde has entrado
  await expect(page.getByText(/Estás en/)).toBeVisible({ timeout: 20_000 });

  const antes = (await (await page.request.get(`/api/v1/projects/${projectUrl.split("/p/")[1]}/scenes`)).json()) as {
    scenes: { id: string; initialViewJson: string | null }[];
  };
  await page.getByRole("button", { name: /Guardar como vista de inicio/ }).click();
  await expect(page.getByText("Guardado").first()).toBeVisible({ timeout: 15_000 });
  const despues = (await (await page.request.get(`/api/v1/projects/${projectUrl.split("/p/")[1]}/scenes`)).json()) as {
    scenes: { id: string; initialViewJson: string | null }[];
  };
  // Guardar la llegada escribe la vista inicial de la escena de arranque
  expect(despues.scenes[0]!.initialViewJson).not.toBe(antes.scenes[0]!.initialViewJson);
  expect(JSON.parse(despues.scenes[0]!.initialViewJson!)).toHaveProperty("yaw");
});

test("visor publico: navegacion, panel y deep link", async ({ page }) => {
  await page.goto("/t/tour-e2e");
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".anda-title")).toHaveText("Tour E2E");
  // Abrir el panel de texto
  await page.locator('.anda-hotspot[aria-label*="Panel E2E"]').click();
  await expect(page.locator(".anda-panel")).toContainText("markdown");
  await page.keyboard.press("Escape");
  // Deep link presente en la URL
  await expect.poll(() => page.url()).toContain("#s=");
  // Modo accesible
  await page.locator('button[aria-label="Versión accesible"]').click();
  await expect(page.locator(".anda-accessible")).toContainText("Escena E2E");
});

test("publicar en modo quiosco: el enlace de siempre arranca en bucle", async ({ page }) => {
  await login(page);
  await page.goto("/studio/");
  await page.getByText("Tour E2E").first().click();
  await page.waitForURL("**/studio/p/**");
  const projectUrl = page.url().split("?")[0]!;

  const publicar = async (modo: "kiosk" | "tour"): Promise<void> => {
    await page.goto(projectUrl);
    await page.locator("header").getByRole("button", { name: /Publicar|Republicar/ }).click();
    const dlg = page.locator('[role="dialog"]', { hasText: "Publicar tour" });
    await dlg.locator("#pb-modo").selectOption(modo);
    await dlg.getByRole("button", { name: /^(Publicar|Republicar)$/ }).click();
    await expect(dlg.locator('a[href*="/t/"]').first()).toBeVisible({ timeout: 60_000 });
    // El otro modo queda a mano sin republicar
    await expect(dlg.getByText(modo === "kiosk" ? "Recorrido normal:" : "Modo quiosco:")).toBeVisible();
  };

  // Publicado como quiosco, la direccion de siempre ya sale en bucle. El
  // parametro `v` solo evita el cache del navegador: la pagina publica se
  // sirve con max-age de 60 s y aqui se cambia de modo en segundos.
  await publicar("kiosk");
  await page.goto("/t/tour-e2e?v=quiosco");
  await expect(page.locator(".anda-kiosk")).toBeVisible({ timeout: 30_000 });
  // Del tour en bucle sale el recorrido suelto sin republicar
  await page.goto("/t/tour-e2e?kiosk=0&v=suelto");
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".anda-kiosk")).toHaveCount(0);

  // Y de vuelta al recorrido normal, donde el parametro sigue valiendo
  await publicar("tour");
  await page.goto("/t/tour-e2e?v=normal");
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".anda-kiosk")).toHaveCount(0);
  await page.goto("/t/tour-e2e?kiosk=1&v=forzado");
  await expect(page.locator(".anda-kiosk")).toBeVisible({ timeout: 30_000 });

  // La barra no puede taparle la cara a las miniaturas
  const solapan = await page.evaluate(() => {
    const barra = document.querySelector(".anda-kiosk")?.getBoundingClientRect();
    const tiras = document.querySelector(".anda-thumbs")?.getBoundingClientRect();
    if (barra == null || tiras == null) return false;
    return tiras.bottom > barra.top + 4;
  });
  expect(solapan).toBe(false);
});

test("el tour compartido lleva tarjeta con imagen propia", async ({ request }) => {
  // Pegar un tour en un chat tiene que enseñar el panorama, no un enlace pelado
  const html = await (await request.get("/t/tour-e2e")).text();
  expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  expect(html).toContain('property="og:site_name" content="andarama"');
  const og = /<meta property="og:image" content="([^"]+)">/.exec(html);
  expect(og).not.toBeNull();
  expect(og![1]).toContain("/t/tour-e2e/share.jpg");

  const img = await request.get("/t/tour-e2e/share.jpg");
  expect(img.ok()).toBeTruthy();
  expect(img.headers()["content-type"]).toContain("image/");
  // Que sea una imagen de verdad y no un placeholder de cuatro bytes
  expect((await img.body()).length).toBeGreaterThan(2000);
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
  expect(js).toContain("anda-tour");
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
    data: { email: "docente@andarama.test", name: "Docente E2E", password: "password-e2e-456", orgId },
    headers: { "x-csrf-token": token },
  });
  expect(user.status()).toBe(201);
  const list = (await (await page.request.get("/api/v1/admin/users")).json()) as { email: string }[];
  expect(list.some((u) => u.email === "docente@andarama.test")).toBeTruthy();
});

test("un hotspot de navegación ofrece el salto a su escena, y el icono se puede girar", async ({ page }) => {
  await login(page);
  await page.goto("/studio/");
  await page.getByText("Tour E2E").first().click();
  await page.waitForURL("**/studio/p/**");
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });

  // Una segunda escena para tener un destino distinto
  await page.locator('button[aria-label="Añadir escena"]').click();
  await page.fill("#ns-title", "Escena destino");
  const sceneDialog = page.locator('[role="dialog"]', { hasText: "Añadir escena" });
  await sceneDialog.getByRole("button", { name: "Elegir de la biblioteca" }).click();
  const picker = page.locator('[role="dialog"]', { hasText: "Elegir de la biblioteca" }).last();
  await picker.getByRole("button", { name: /\.jpg/ }).first().click();
  await sceneDialog.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });

  // Volver a la primera y colocar allí el paso hacia la nueva
  await abrirEscena(page, "Escena E2E");
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /añadir hotspot/i }).first().click();
  await page.locator('[role="dialog"] input').first().fill("navegación");
  await page.getByRole("button", { name: /^Navegación/ }).first().click();
  await page.locator(".anda-viewer").first().click({ position: { x: 520, y: 300 } });
  await page.selectOption("#hs-target", { label: "Escena destino" });

  // El salto aparece pegado al marcador y lleva a la escena de destino
  const salto = page.locator(".anda-salto");
  await expect(salto).toBeVisible({ timeout: 20_000 });
  await expect(salto).toContainText("Escena destino");
  // El paso se coloca en un rumbo concreto para poder comprobar la llegada
  await page.fill("#hs-yaw", "60");
  await page.locator("#hs-yaw").blur();
  await salto.click();
  await expect(page.locator("#sc-title")).toHaveValue("Escena destino", { timeout: 20_000 });

  // Se llega mirando como llega quien viene por ese paso, no a la vista por
  // defecto de la escena (yaw 0). Sin marcador de vuelta, «hacia delante»
  // deja la vista en el rumbo del propio paso.
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const aguja = document.querySelector<SVGGElement>(".anda-compass__needle");
          const m = /rotate\((-?[\d.]+)deg\)/.exec(aguja?.style.transform ?? "");
          if (m == null) return null;
          // La aguja marca el norte respecto a la vista: el yaw es su opuesto
          const yaw = ((-parseFloat(m[1]!) % 360) + 360) % 360;
          return Math.round(yaw);
        }),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(55);

  // El giro del icono llega al marcador del panorama
  await abrirEscena(page, "Escena E2E");
  await expect(page.locator(".anda-hotspot").first()).toBeVisible({ timeout: 30_000 });
  await page.locator(".anda-hotspot").first().click();
  await page.getByRole("button", { name: "Estilo", exact: true }).click();
  await page.getByRole("button", { name: "135°", exact: true }).click();
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const glifo = document.querySelector<HTMLElement>(".anda-hotspot__icon > *");
          return glifo?.style.transform ?? "";
        }),
      { timeout: 30_000 },
    )
    .toBe("rotate(135deg)");
});

test("la barra de vídeo no se queda de pastilla negra en las escenas de foto", async ({ page }) => {
  await login(page);
  await page.goto("/studio/");
  await page.getByText("Tour E2E").first().click();
  await page.waitForURL("**/studio/p/**");
  await expect(page.locator(".anda-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  const visible = await page.evaluate(() => {
    const barra = document.querySelector<HTMLElement>(".anda-videobar");
    if (barra == null) return false;
    return getComputedStyle(barra).display !== "none" || barra.getBoundingClientRect().height > 0;
  });
  expect(visible).toBe(false);
});

/** Elegir una escena de la lista sin tropezar con sus botones flotantes. */
async function abrirEscena(page: Page, titulo: string): Promise<void> {
  await page.locator(".anda-ficha").filter({ hasText: titulo }).first().click({ position: { x: 40, y: 20 } });
}

/** Token CSRF de la cookie u3c de la sesion actual. */
async function csrf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === "u3c")?.value ?? "";
}

/**
 * Sesion compartida entre pruebas. Cada prueba estrena contexto, asi que
 * autenticarse de verdad en todas acababa chocando con el limite de intentos
 * de login (ocho por cuarto de hora), que es una proteccion deseable: se
 * reutilizan las cookies de la primera.
 */
let sessionCookies: Awaited<ReturnType<Page["context"]>["cookies"]> extends Promise<infer T> ? T : never = [] as never;

async function login(page: Page): Promise<void> {
  if (sessionCookies.length > 0) {
    // Solo las cookies: navegar aqui se pisaba con la navegacion de la prueba
    await page.context().addCookies(sessionCookies);
    return;
  }
  await page.goto("/studio/login");
  // Si ya hay sesion, redirige solo
  if (page.url().endsWith("/studio/")) return;
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/studio/");
  sessionCookies = await page.context().cookies();
}
