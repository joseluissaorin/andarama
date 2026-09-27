import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * LTI 1.3 de punta a punta con un Moodle 4.5 real:
 *
 *  1. Andarama: el operador abre la instancia y un centro (cliente) se da de
 *     alta, sube un panorama y publica un recorrido con dos preguntas.
 *  2. Moodle: el administrador registra Andarama como herramienta externa
 *     LTI 1.3 (Deep Linking + servicio de calificaciones).
 *  3. Andarama: el administrador del centro da de alta la plataforma Moodle.
 *  4. Moodle: la profesora añade la actividad eligiendo el recorrido con
 *     Deep Linking.
 *  5. Moodle: el alumno lanza la actividad y responde el quiz.
 *  6. Moodle: la nota aparece en el libro de calificaciones.
 *
 * Requiere el Moodle de docker-compose.yml preparado con moodle-setup.sh.
 */

const MOODLE = process.env.MOODLE_URL ?? "http://localhost:8080";
const ANDARAMA = "http://andarama.test:8795";
const MOODLE_ADMIN = { user: "admin", pass: process.env.MOODLE_ADMIN_PASSWORD ?? "Admin-lti-2026" };
const TEACHER = { user: "profesora", pass: "Moodle-lti-2026" };
const STUDENT = { user: "alumno", pass: "Moodle-lti-2026" };
const COURSE_SHORTNAME = "ANDA360";

const run = Date.now().toString(36);
const TOOL_NAME = `Andarama ${run}`;
const ORG_ADMIN = { name: "Marta Centro", email: `centro-${run}@andarama.test`, password: "password-centro-123" };
const TOUR_TITLE = `Laboratorio de química ${run}`;
/** Moodle toma el nombre de la actividad del título que devuelve el Deep Linking. */
const ACTIVITY_NAME = TOUR_TITLE;

const shared: {
  slug?: string;
  projectId?: string;
  platform?: { issuer: string; clientId: string; deploymentId: string; authUrl: string; tokenUrl: string; jwksUrl: string };
  courseId?: string;
} = {};

test.describe.configure({ mode: "serial" });

// ---------------------------------------------------------------- utilidades

/**
 * Llamada a la API de Andarama desde la propia página (mismo origen, con la
 * sesión y el token CSRF del Studio). El contexto de peticiones de Node no
 * resuelve andarama.test: solo el navegador lleva la regla de resolución.
 */
async function andaApi(page: Page, method: string, path: string, body?: unknown): Promise<any> {
  if (!page.url().startsWith(ANDARAMA)) await page.goto(`${ANDARAMA}/studio/login`);
  const res = await page.evaluate(
    async ({ method, url, body }) => {
      const csrf = /(?:^|; )u3c=([^;]+)/.exec(document.cookie)?.[1] ?? "";
      const r = await fetch(url, {
        method,
        credentials: "include",
        headers: { "x-csrf-token": decodeURIComponent(csrf), "content-type": "application/json" },
        body: body != null ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, text: await r.text() };
    },
    { method, url: `/api/v1${path}`, body },
  );
  if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status} ${res.text}`);
  return res.text === "" ? null : JSON.parse(res.text);
}

async function moodleLogin(page: Page, who: { user: string; pass: string }): Promise<void> {
  await page.goto(`${MOODLE}/login/index.php`);
  await page.fill("#username", who.user);
  await page.fill("#password", who.pass);
  await page.click("#loginbtn");
  await expect(page.locator("body")).not.toHaveClass(/pagelayout-login/);
}

async function courseId(page: Page): Promise<string> {
  if (shared.courseId != null) return shared.courseId;
  await page.goto(`${MOODLE}/course/search.php?search=${COURSE_SHORTNAME}`);
  const href = await page.locator('a[href*="/course/view.php?id="]').first().getAttribute("href");
  shared.courseId = new URL(href!, MOODLE).searchParams.get("id")!;
  return shared.courseId;
}

// ------------------------------------------------------------------- pruebas

test("Andarama: el centro publica un recorrido con quiz", async ({ page, context }) => {
  // El primer usuario de una instalación propia es el operador de la instancia
  // (si la instancia ya tiene usuarios, este es uno más y no pasa nada)
  await andaApi(page, "POST", "/auth/register", {
    name: "Operador",
    email: `operador-${run}@andarama.test`,
    password: "password-operador-123",
  });
  await context.clearCookies();

  // El centro cliente se registra con su propia organización
  await page.goto(`${ANDARAMA}/studio/register`);
  await page.fill("#name", ORG_ADMIN.name);
  await page.fill("#email", ORG_ADMIN.email);
  await page.fill("#password", ORG_ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/studio\/$/);

  const me = await andaApi(page, "GET", "/me");
  const orgId = me.orgs[0].id as string;
  expect(me.user?.roleGlobal ?? me.roleGlobal ?? "user").not.toBe("admin");

  // Panorama real, troceado en el navegador como lo hace el Studio
  await page.goto(`${ANDARAMA}/studio/media`);
  await page.setInputFiles('input[type="file"]', resolve(__dirname, "../../examples/panoramas/aula-magna.jpg"));
  let mediaId = "";
  await expect
    .poll(
      async () => {
        const items = (await andaApi(page, "GET", `/media?org=${orgId}`)) as {
          id: string;
          kind: string;
          status: string;
          derivatives: { kind: string }[];
        }[];
        const pano = items.find((m) => m.kind === "panorama" && m.status === "ready" && m.derivatives.some((d) => d.kind === "tiles"));
        mediaId = pano?.id ?? "";
        return mediaId !== "";
      },
      { timeout: 90_000 },
    )
    .toBe(true);

  const project = await andaApi(page, "POST", "/projects", { orgId, title: TOUR_TITLE, defaultLang: "es" });
  const scene = await andaApi(page, "POST", `/projects/${project.id}/scenes`, {
    title: "Aula magna",
    type: "image",
    mediaId,
  });
  await andaApi(page, "PATCH", `/projects/${project.id}/scenes/${scene.id}`, {
    initialView: { yaw: 0, pitch: 0, fov: 1.4 },
  });
  const preguntas = [
    {
      id: `pregunta-uno-${run}`,
      yaw: -0.25,
      question: "¿Qué gas desprende el magnesio en ácido clorhídrico?",
      options: [
        { id: "hidrogeno", text: "Hidrógeno", correct: true },
        { id: "oxigeno", text: "Oxígeno" },
      ],
    },
    {
      id: `pregunta-dos-${run}`,
      yaw: 0.25,
      question: "¿Qué pH tiene el agua pura a 25 °C?",
      options: [
        { id: "siete", text: "7", correct: true },
        { id: "cero", text: "0" },
      ],
    },
  ];
  for (const [i, p] of preguntas.entries()) {
    await andaApi(page, "POST", `/projects/${project.id}/scenes/${scene.id}/hotspots`, {
      id: p.id,
      type: "quiz",
      position: { yaw: p.yaw, pitch: 0 },
      content: { question: p.question, kind: "single", options: p.options, points: 1 },
      sort: i,
    });
  }
  await andaApi(page, "PATCH", `/projects/${project.id}`, {
    settings: { quiz: { passingScore: 50, finalReport: true } },
  });
  const pub = await andaApi(page, "POST", `/projects/${project.id}/publish`, { visibility: "public" });
  shared.slug = pub.slug as string;
  shared.projectId = project.id as string;
  expect(shared.slug).toBeTruthy();
});

test("Moodle: el administrador registra Andarama como herramienta LTI 1.3", async ({ page }) => {
  await moodleLogin(page, MOODLE_ADMIN);
  await page.goto(`${MOODLE}/mod/lti/toolconfigure.php`);
  await page.getByRole("link", { name: /configure a tool manually/i }).click();
  await page.waitForURL(/typessettings\.php/);

  await page.fill("#id_lti_typename", TOOL_NAME);
  await page.fill("#id_lti_toolurl", `${ANDARAMA}/api/v1/lti/launch`);
  await page.selectOption("#id_lti_ltiversion", "1.3.0");
  await page.selectOption("#id_lti_keytype", "JWK_KEYSET");
  await page.fill("#id_lti_publickeyset", `${ANDARAMA}/api/v1/lti/jwks`);
  await page.fill("#id_lti_initiatelogin", `${ANDARAMA}/api/v1/lti/login`);
  await page.fill("#id_lti_redirectionuris", `${ANDARAMA}/api/v1/lti/launch`);
  // «Show in activity chooser and as a preconfigured tool»
  await page.selectOption("#id_lti_coursevisible", "2");
  await page.check("#id_lti_contentitem");
  await page.fill("#id_lti_toolurl_ContentItemSelectionRequest", `${ANDARAMA}/api/v1/lti/launch`);

  // Servicios: AGS para devolver la nota; privacidad: nombre y notas
  await page.getByRole("button", { name: "Expand all" }).click();
  await page.locator("#id_ltiservice_gradesynchronization").selectOption({ label: "Use this service for grade sync and column management" });
  await page.selectOption("#id_lti_sendname", { label: "Always" });
  await page.selectOption("#id_lti_acceptgrades", { label: "Always" });
  await page.click("#id_submitbutton");
  await page.waitForURL(/toolconfigure\.php/);

  // Detalles de configuración que Moodle da para la herramienta
  const card = page.locator(".tool-card", { hasText: TOOL_NAME });
  await card.locator("a.viewdetails").click();
  const modal = page.locator(".modal-dialog", { hasText: "Platform ID" });
  await expect(modal).toBeVisible();
  const text = await modal.innerText();
  const field = (label: string): string => {
    const m = new RegExp(`${label}:\\s*(\\S+)`).exec(text);
    if (m == null) throw new Error(`No aparece «${label}» en los detalles de Moodle:\n${text}`);
    return m[1]!;
  };
  shared.platform = {
    issuer: field("Platform ID"),
    clientId: field("Client ID"),
    deploymentId: field("Deployment ID"),
    authUrl: field("Authentication request URL"),
    tokenUrl: field("Access token URL"),
    jwksUrl: field("Public keyset URL"),
  };
  expect(shared.platform.issuer).toBe(MOODLE);
});

test("Andarama: el administrador del centro da de alta la plataforma Moodle", async ({ page }) => {
  const p = shared.platform!;
  await page.goto(`${ANDARAMA}/studio/login`);
  await page.fill("#email", ORG_ADMIN.email);
  await page.fill("#password", ORG_ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));
  await page.goto(`${ANDARAMA}/studio/org`);
  const section = page.locator("section", { hasText: "LTI: Moodle y otros LMS" });
  await expect(section).toBeVisible();
  await section.getByLabel(/^Issuer/).fill(p.issuer);
  await section.getByLabel("Client ID").fill(p.clientId);
  await section.getByLabel("Deployment ID").fill(p.deploymentId);
  await section.getByLabel(/^Auth URL/).fill(p.authUrl);
  await section.getByLabel(/^Token URL/).fill(p.tokenUrl);
  await section.getByLabel(/^JWKS URL/).fill(p.jwksUrl);
  await section.getByRole("button", { name: "Crear" }).click();
  await expect(section.getByText(p.clientId)).toBeVisible();
});

test("Moodle: la profesora elige el recorrido con Deep Linking", async ({ page }) => {
  await moodleLogin(page, TEACHER);
  const id = await courseId(page);
  // Es lo que abre el selector de actividades al elegir la herramienta (en
  // Moodle el identificador de despliegue es el del tipo de herramienta)
  await page.goto(`${MOODLE}/course/modedit.php?add=lti&typeid=${shared.platform!.deploymentId}&course=${id}&section=1&return=0`);
  await page.click("#id_selectcontent");
  const picker = page.frameLocator("iframe#contentframe, .modal iframe").first();
  await picker.getByRole("button", { name: TOUR_TITLE }).click();
  // Moodle rellena el formulario con el contenido devuelto y cierra el modal
  await expect(page.locator(".modal iframe")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator("#id_name")).toHaveValue(ACTIVITY_NAME);
  await page.click("#id_submitbutton");
  await expect(page.locator("iframe#contentframe")).toBeVisible();
});

test("Moodle: el alumno lanza la actividad y responde el quiz", async ({ page }) => {
  await moodleLogin(page, STUDENT);
  const id = await courseId(page);
  await page.goto(`${MOODLE}/course/view.php?id=${id}`);
  const href = await page.getByRole("link", { name: ACTIVITY_NAME }).first().getAttribute("href");
  await page.goto(href!);
  const tour = page.frameLocator("iframe#contentframe");
  const respuestas = [
    [`pregunta-uno-${run}`, "Hidrógeno"],
    [`pregunta-dos-${run}`, "7"],
  ] as const;
  for (const [i, [hotspot, option]] of respuestas.entries()) {
    await tour.locator(`.anda-hotspot[data-hotspot-id="${hotspot}"]`).click();
    await tour.locator(".anda-quiz__option", { hasText: option }).click();
    await tour.getByRole("button", { name: "Comprobar" }).click();
    if (i < respuestas.length - 1) {
      await tour.locator(".anda-quiz__feedback--ok").waitFor();
      await tour.getByRole("dialog").getByRole("button", { name: "Cerrar" }).click();
    }
  }
  // Con la última respuesta el visor muestra el informe y manda el resultado
  await expect(tour.getByText("Puntuación: 2 / 2")).toBeVisible();
  await expect(tour.getByText("Aprobado")).toBeVisible();
});

test("Moodle: la nota está en el libro de calificaciones", async ({ page }) => {
  // El alumno ve su nota en la actividad concreta
  await moodleLogin(page, STUDENT);
  const id = await courseId(page);
  await expect
    .poll(
      async () => {
        await page.goto(`${MOODLE}/grade/report/user/index.php?id=${id}`);
        const fila = page.locator("tr", { has: page.getByRole("link", { name: ACTIVITY_NAME }) });
        return (await fila.innerText().catch(() => "")).includes("100.00");
      },
      { timeout: 30_000, intervals: [2_000] },
    )
    .toBe(true);

  // Y la profesora, en el informe del calificador
  await page.context().clearCookies();
  await moodleLogin(page, TEACHER);
  await page.goto(`${MOODLE}/grade/report/grader/index.php?id=${id}`);
  await expect(page.getByRole("link", { name: ACTIVITY_NAME }).first()).toBeVisible();
  await page.screenshot({ path: resolve(__dirname, "test-results/libro-de-calificaciones.png"), fullPage: true });
});

test("Andarama: el resultado queda registrado como lanzamiento LTI", async ({ page }) => {
  await page.goto(`${ANDARAMA}/studio/login`);
  await page.fill("#email", ORG_ADMIN.email);
  await page.fill("#password", ORG_ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));
  const results = (await andaApi(page, "GET", `/projects/${shared.projectId}/quiz-results`)) as {
    participantName: string | null;
    score: number;
    maxScore: number;
    passed: boolean | null;
    lti: boolean;
  }[];
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ participantName: "Luis Alumno", score: 2, maxScore: 2, passed: true, lti: true });
});
