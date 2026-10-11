import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * Edición en grupo con dos personas reales, cada una en su navegador, contra
 * el servidor self-host (Node + ws): se ven, ven el bloqueo blando del panel
 * que tiene abierto la otra y ven sus cambios sin recargar.
 */

test.describe.configure({ mode: "serial" });

const PASSWORD = "password-colab-123";
const stamp = Date.now().toString(36);
const ANA = { email: `ana-${stamp}@colab.test`, name: "Ana Colab" };
const LUIS = { email: `luis-${stamp}@colab.test`, name: "Luis Colab" };

async function csrf(context: BrowserContext): Promise<string> {
  return (await context.cookies()).find((c) => c.name === "u3c")?.value ?? "";
}

async function post(context: BrowserContext, request: APIRequestContext, path: string, data: unknown): Promise<Record<string, unknown>> {
  const res = await request.post(`/api/v1${path}`, { data, headers: { "x-csrf-token": await csrf(context) } });
  expect(res.ok(), `${path}: ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as Record<string, unknown>;
}

async function signUp(context: BrowserContext, who: { email: string; name: string }): Promise<void> {
  const res = await context.request.post("/api/v1/auth/register", { data: { email: who.email, name: who.name, password: PASSWORD } });
  expect(res.status(), await res.text()).toBe(201);
}

let ana: { context: BrowserContext; page: Page };
let luis: { context: BrowserContext; page: Page };
let projectUrl = "";

test.beforeAll(async ({ browser }) => {
  const a = await browser.newContext({ locale: "es-ES", viewport: { width: 1440, height: 900 } });
  const l = await browser.newContext({ locale: "es-ES", viewport: { width: 1440, height: 900 } });
  await signUp(a, ANA);
  await signUp(l, LUIS);
  const me = (await (await a.request.get("/api/v1/me")).json()) as { orgs: { id: string }[] };
  const project = await post(a, a.request, "/projects", { orgId: me.orgs[0]!.id, title: "Recorrido en grupo" });
  const projectId = String(project.id);
  await post(a, a.request, `/projects/${projectId}/scenes`, { title: "Entrada" });
  await post(a, a.request, `/projects/${projectId}/scenes`, { title: "Patio" });
  await post(a, a.request, `/projects/${projectId}/members`, { email: LUIS.email, role: "collaborator" });
  projectUrl = `/studio/p/${projectId}`;
  ana = { context: a, page: await a.newPage() };
  luis = { context: l, page: await l.newPage() };
});

test.afterAll(async () => {
  await ana?.context.close();
  await luis?.context.close();
});

test("cada uno ve a la otra persona en la cabecera", async () => {
  await ana.page.goto(projectUrl);
  await expect(ana.page.locator("#sc-title")).toHaveValue("Entrada");
  await luis.page.goto(projectUrl);
  await expect(ana.page.locator(`[data-collab-user="${LUIS.name}"]`)).toBeVisible({ timeout: 15_000 });
  await expect(luis.page.locator(`[data-collab-user="${ANA.name}"]`)).toBeVisible({ timeout: 15_000 });
  await expect(ana.page.locator(`[data-collab-user="${LUIS.name}"]`)).toHaveText("LC");
});

test("el panel que Ana abrió primero queda en solo lectura para Luis", async () => {
  // Los dos abren la primera escena; Ana llegó antes
  const lock = luis.page.getByTestId("collab-lock");
  await expect(lock).toContainText(`Lo está editando ${ANA.name}`);
  await expect(luis.page.locator("#sc-title")).toBeDisabled();
  await expect(ana.page.getByTestId("collab-lock")).toHaveCount(0);
  await expect(ana.page.locator("#sc-title")).toBeEnabled();
  // «Editar igualmente» lo salta
  await lock.getByRole("button", { name: "Editar igualmente" }).click();
  await expect(luis.page.locator("#sc-title")).toBeEnabled();
});

test("lo que escribe una persona le llega a la otra sin recargar", async () => {
  // Luis se va a la segunda escena y la renombra
  // (el texto, no la ficha entera: en el centro asoman los botones de la ficha)
  await luis.page.getByText("Patio", { exact: true }).first().click({ position: { x: 4, y: 6 } });
  await expect(luis.page.locator("#sc-title")).toHaveValue("Patio");
  await expect(luis.page.getByTestId("collab-lock")).toHaveCount(0);
  await luis.page.locator("#sc-title").fill("Patio de columnas");
  await expect(ana.page.getByText("Patio de columnas", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  // Y a la vez Ana renombra la suya: ninguna de las dos se pierde
  await ana.page.locator("#sc-title").fill("Entrada principal");
  await expect(luis.page.getByText("Entrada principal", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(ana.page.getByText("Patio de columnas", { exact: true }).first()).toBeVisible();

  // Lo que quedó en el servidor es la suma de los dos
  const projectId = projectUrl.split("/").pop()!;
  await expect
    .poll(async () => {
      const content = (await (await ana.context.request.get(`/api/v1/projects/${projectId}/scenes`)).json()) as { scenes: { title: string }[] };
      return content.scenes.map((s) => s.title).sort();
    }, { timeout: 15_000 })
    .toEqual(["Entrada principal", "Patio de columnas"]);
});

test("al salir una persona, la otra deja de verla", async () => {
  await luis.page.goto("/studio/");
  await expect(ana.page.locator(`[data-collab-user="${LUIS.name}"]`)).toHaveCount(0, { timeout: 15_000 });
});

test("Luis, que es de otra organización, ve las miniaturas del recorrido", async () => {
  const projectId = projectUrl.split("/").pop()!;
  // Ana sube una foto al recorrido, con su miniatura, y la usa en una escena
  await ana.page.goto("/studio/");
  const jpeg = await ana.page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#c2410c";
    ctx.fillRect(0, 0, 64, 32);
    return canvas.toDataURL("image/jpeg").split(",")[1]!;
  });
  const bytes = Buffer.from(jpeg, "base64");
  const put = async (url: string): Promise<void> => {
    const u = new URL(url);
    const res = await ana.context.request.put(`${u.pathname}${u.search}`, { data: bytes, headers: { "content-type": "image/jpeg" } });
    expect(res.ok(), await res.text()).toBe(true);
  };
  const me = (await (await ana.context.request.get("/api/v1/me")).json()) as { orgs: { id: string }[] };
  const created = (await post(ana.context, ana.context.request, "/media", {
    orgId: me.orgs[0]!.id,
    projectId,
    kind: "image",
    filename: "fachada.jpg",
    mime: "image/jpeg",
    bytes: bytes.length,
  })) as unknown as { media: { id: string }; upload: { url: string } };
  const mediaId = created.media.id;
  await put(created.upload.url);
  await post(ana.context, ana.context.request, `/media/${mediaId}/complete`, { width: 64, height: 32 });
  const thumbKey = `derived/${mediaId}/thumb.jpg`;
  const { urls } = (await post(ana.context, ana.context.request, `/media/${mediaId}/derivative-uploads`, { keys: [thumbKey] })) as unknown as {
    urls: Record<string, string>;
  };
  await put(urls[thumbKey]!);
  await post(ana.context, ana.context.request, `/media/${mediaId}/derivatives`, { kind: "thumb", manifest: {} });

  // En el editor de Luis, la biblioteca del recorrido la enseña y la miniatura carga
  await luis.page.goto(projectUrl);
  const thumb = luis.page.locator(`img[src="/api/v1/media/${mediaId}/derived/thumb"]`).first();
  await expect(thumb).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 15_000 }).toBe(true);
  await expect(luis.page.getByText("Aún no hay medios en este tour")).toHaveCount(0);
  // «Toda la biblioteca» es de la organización de Ana: a Luis no se le ofrece
  await expect(luis.page.getByRole("button", { name: "Toda la biblioteca" })).toHaveCount(0);
});

test("en Proyectos, Luis encuentra el recorrido en «Compartidos contigo» y lo abre", async () => {
  await luis.page.goto("/studio/");
  const bloque = luis.page.getByTestId("shared-with-you");
  await expect(bloque.getByRole("heading", { name: "Compartidos contigo" })).toBeVisible({ timeout: 15_000 });
  await expect(bloque).toContainText(`De ${ANA.name}`);
  await expect(bloque).toContainText("Colaborador");
  await bloque.getByRole("button", { name: "Recorrido en grupo" }).first().click();
  await expect(luis.page).toHaveURL(new RegExp(`${projectUrl}$`));
  // Ana no lo ve ahí: el recorrido es de su organización
  await ana.page.goto("/studio/");
  await expect(ana.page.getByRole("heading", { name: "Recorrido en grupo" }).first()).toBeVisible({ timeout: 15_000 });
  await expect(ana.page.getByTestId("shared-with-you")).toHaveCount(0);
});
