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
