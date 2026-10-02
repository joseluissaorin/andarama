import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { feedbackReports } from "@andarama/db";
import type { MailMessage } from "@andarama/adapters";
import { bearerCaller, createTestInstance, fakeClerk, type TestInstance } from "./test-support.js";

/**
 * «Informar de un problema» desde el Studio: hace falta sesión, se valida la
 * descripción y la captura (imagen real, 5 MB como mucho), se guarda la
 * captura en `feedback/<id>.<ext>`, se avisa a DEMO_NOTIFY_TO y hay límite
 * de envíos por persona. El panel de administración los lista.
 */

const people = {
  "tok-ana": { email: "ana@ejemplo.es", name: "Ana Pérez", plan: "u:andar" },
  "tok-oper": { email: "operador@andarama.test", name: "Operador", plan: null },
  "tok-pesada": { email: "pesada@ejemplo.es", name: "Pesada", plan: null },
};

let inst: TestInstance;
let call: ReturnType<typeof bearerCaller>;
const enviados: MailMessage[] = [];
const pendientes: Promise<unknown>[] = [];

/** Un PNG mínimo válido (cabecera de 8 bytes y algo de relleno). */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

function multipart(token: string | null, data: unknown, image?: Blob, filename = "captura.png"): Promise<Response> {
  const form = new FormData();
  form.set("data", JSON.stringify(data));
  if (image != null) form.set("image", image, filename);
  const headers: Record<string, string> = {};
  if (token != null) headers.authorization = `Bearer ${token}`;
  return Promise.resolve(inst.app.request("http://localhost/api/v1/feedback", { method: "POST", headers, body: form }));
}

const contexto = {
  url: "http://localhost/studio/p/proj1",
  projectId: "proj1",
  sceneId: "esc1",
  userAgent: "Vitest",
  viewport: "1280×800",
  version: "0.1.0+abc1234 · 2026-10-02",
};

beforeAll(async () => {
  inst = await createTestInstance(
    {
      clerk: { publishableKey: "pk_test_x", secretKey: "sk_test_x" },
      adminEmails: ["operador@andarama.test"],
      demoNotifyTo: "avisos@andarama.test",
    },
    fakeClerk(people),
  );
  // Correo saliente simulado y tareas diferidas que se pueden esperar
  inst.runtime.email = {
    configured: true,
    send: async (m) => {
      enviados.push(m);
    },
  };
  inst.runtime.deferred = (p) => {
    pendientes.push(p);
  };
  call = bearerCaller(inst.app);
  for (const token of Object.keys(people)) await call(token, "/api/v1/me");
});

describe("POST /api/v1/feedback", () => {
  it("exige sesión", async () => {
    expect((await call(null, "/api/v1/feedback", { method: "POST", body: { description: "Hola" } })).status).toBe(401);
  });

  it("valida la descripción y el contexto", async () => {
    expect((await call("tok-ana", "/api/v1/feedback", { method: "POST", body: { description: "   " } })).status).toBe(400);
    expect((await call("tok-ana", "/api/v1/feedback", { method: "POST", body: {} })).status).toBe(400);
    expect(
      (await call("tok-ana", "/api/v1/feedback", { method: "POST", body: { description: "x", context: { cosa: "rara" } } })).status,
    ).toBe(400);
    expect((await call("tok-ana", "/api/v1/feedback", { method: "POST", body: { description: "x".repeat(5001) } })).status).toBe(400);
  });

  it("guarda el informe sin captura y avisa por correo", async () => {
    const res = await call("tok-ana", "/api/v1/feedback", {
      method: "POST",
      body: { description: "El botón Publicar no responde", context: contexto },
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    await Promise.all(pendientes);
    const [fila] = await inst.db.select().from(feedbackReports).where(eq(feedbackReports.id, id));
    expect(fila).toMatchObject({ description: "El botón Publicar no responde", imageKey: null });
    expect(fila!.userId).not.toBeNull();
    expect(JSON.parse(fila!.contextJson!)).toEqual(contexto);
    expect(fila!.notifiedAt).not.toBeNull();
    const aviso = enviados.at(-1)!;
    expect(aviso.to).toBe("avisos@andarama.test");
    expect(aviso.text).toContain("Ana Pérez");
    expect(aviso.text).toContain("0.1.0+abc1234");
  });

  it("guarda la captura en feedback/<id>.png y el panel la sirve", async () => {
    const res = await multipart("tok-ana", { description: "Se ve mal la escena", context: contexto }, new Blob([PNG], { type: "image/png" }));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const [fila] = await inst.db.select().from(feedbackReports).where(eq(feedbackReports.id, id));
    expect(fila!.imageKey).toBe(`feedback/${id}.png`);
    expect(await inst.runtime.storage.getBytes(`feedback/${id}.png`)).toEqual(PNG);

    // Solo el administrador lo ve en el panel
    expect((await call("tok-ana", "/api/v1/admin/feedback")).status).toBe(403);
    const lista = (await (await call("tok-oper", "/api/v1/admin/feedback")).json()) as {
      id: string;
      userEmail: string;
      hasImage: boolean;
      context: Record<string, unknown>;
    }[];
    const informe = lista.find((f) => f.id === id)!;
    expect(informe).toMatchObject({ userEmail: "ana@ejemplo.es", hasImage: true, context: { sceneId: "esc1" } });
    expect((await call("tok-ana", `/api/v1/admin/feedback/${id}/image`)).status).toBe(403);
    const img = await call("tok-oper", `/api/v1/admin/feedback/${id}/image`);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG);
  });

  it("rechaza capturas que no son imágenes o pasan de 5 MB", async () => {
    const texto = new Blob([new TextEncoder().encode("<script>alert(1)</script>")], { type: "image/png" });
    expect((await multipart("tok-ana", { description: "Falsa" }, texto)).status).toBe(400);
    const grande = new Uint8Array(5 * 1024 * 1024 + 1);
    grande.set(PNG);
    expect((await multipart("tok-ana", { description: "Enorme" }, new Blob([grande], { type: "image/png" }))).status).toBe(413);
    expect((await multipart("tok-ana", "no es un objeto")).status).toBe(400);
  });

  it("limita los envíos por persona", async () => {
    const codigos: number[] = [];
    for (let i = 0; i < 11; i++) {
      codigos.push((await call("tok-pesada", "/api/v1/feedback", { method: "POST", body: { description: `Informe ${i}` } })).status);
    }
    expect(codigos.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(codigos[10]).toBe(429);
  });
});
