import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, comments, formSubmissions, media, orgMembers, orgs, projects, publications, users } from "@andarama/db";
import type { PlatformRuntime } from "@andarama/adapters";
import type { Db } from "./lib/context.js";
import { svixSign, svixVerify } from "./lib/svix.js";
import { ANONYMOUS_AUTHOR } from "./lib/account-deletion.js";
import { bearerCaller, createTestInstance, fakeClerk, type TestInstance } from "./test-support.js";

/**
 * Webhooks de Clerk con firmas Svix simuladas: la supresión de la cuenta
 * (`user.deleted`) y los eventos de Clerk Billing que fechan el primer pago.
 */

const SECRET = `whsec_${btoa("secreto-de-prueba-del-webhook-de-andarama")}`;

const people = {
  "tok-op": { email: "operador@andarama.test", name: "Operador", plan: null },
  "tok-lola": { email: "lola@ejemplo.test", name: "Lola", plan: "u:paseo" },
  "tok-mar": { email: "mar@ejemplo.test", name: "Mar", plan: "u:paseo" },
  "tok-nico": { email: "nico@ejemplo.test", name: "Nico", plan: null },
};

let inst: TestInstance;
let db: Db;
let runtime: PlatformRuntime;
let call: ReturnType<typeof bearerCaller>;
let seq = 0;

async function send(event: unknown, opts: { secret?: string; timestamp?: number; id?: string } = {}): Promise<Response> {
  const body = JSON.stringify(event);
  const id = opts.id ?? `msg_${++seq}`;
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = await svixSign(opts.secret ?? SECRET, id, timestamp, body);
  return inst.app.request("http://localhost/api/v1/webhooks/clerk", {
    method: "POST",
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature },
    body,
  });
}

async function userOf(email: string) {
  return (await db.select().from(users).where(eq(users.email, email)))[0];
}

beforeAll(async () => {
  inst = await createTestInstance(
    {
      clerk: { publishableKey: "pk_test_x", secretKey: "sk_test_x" },
      adminEmails: ["operador@andarama.test"],
      clerkWebhookSecret: SECRET,
    },
    fakeClerk(people),
  );
  db = inst.db;
  runtime = inst.runtime;
  call = bearerCaller(inst.app);
  for (const token of Object.keys(people)) await call(token, "/api/v1/me");
});

describe("firma Svix", () => {
  it("acepta la firma buena y cualquiera de varias durante la rotación", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const good = await svixSign(SECRET, "msg_a", ts, "{}");
    expect(await svixVerify(SECRET, { id: "msg_a", timestamp: ts, signature: good }, "{}")).toBe(true);
    expect(await svixVerify(SECRET, { id: "msg_a", timestamp: ts, signature: `v1,AAAA ${good}` }, "{}")).toBe(true);
    expect(await svixVerify(SECRET, { id: "msg_a", timestamp: ts, signature: good }, "{ }")).toBe(false);
    expect(await svixVerify(SECRET, { id: "msg_b", timestamp: ts, signature: good }, "{}")).toBe(false);
  });

  it("rechaza firmas de otro secreto, mensajes viejos y cabeceras ausentes", async () => {
    const event = { type: "user.deleted", data: { id: "user_tok-nico", deleted: true } };
    expect((await send(event, { secret: `whsec_${btoa("otro-secreto-cualquiera")}` })).status).toBe(401);
    expect((await send(event, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(401);
    const sinCabeceras = await inst.app.request("http://localhost/api/v1/webhooks/clerk", { method: "POST", body: JSON.stringify(event) });
    expect(sinCabeceras.status).toBe(401);
    expect(await userOf("nico@ejemplo.test")).toBeDefined();
  });

  it("sin secreto configurado el endpoint no existe", async () => {
    const otra = await createTestInstance({ clerk: { publishableKey: "pk_test_x", secretKey: "sk_test_x" } }, fakeClerk(people));
    const res = await otra.app.request("http://localhost/api/v1/webhooks/clerk", { method: "POST", body: "{}" });
    expect(res.status).toBe(404);
  });
});

describe("Clerk Billing", () => {
  const periodo = Date.UTC(2026, 8, 20, 10, 0, 0);

  it("una suscripción activa copia el plan y fecha el primer pago", async () => {
    const res = await send({
      type: "subscriptionItem.active",
      data: { id: "csi_1", status: "active", plan: { slug: "excursion" }, period_start: periodo, payer: { user_id: "user_tok-nico" } },
    });
    expect(res.status).toBe(200);
    const nico = (await userOf("nico@ejemplo.test"))!;
    expect(nico.plan).toBe("excursion");
    expect(nico.firstPaidAt).toBe(periodo);
    const auditado = (await db.select().from(auditLog).where(eq(auditLog.action, "billing.clerk_webhook"))).find((a) => a.entityId === nico.id);
    expect(JSON.parse(auditado!.detailJson!)).toMatchObject({ type: "subscriptionItem.active", plan: "excursion", firstPaidAt: periodo });
  });

  it("el mismo mensaje repetido por Clerk se procesa una sola vez", async () => {
    const event = { type: "paymentAttempt.updated", data: { status: "paid", paid_at: periodo - 1000, payer: { user_id: "user_tok-nico" } } };
    const first = await send(event, { id: "msg_repetido" });
    expect(await first.json()).toMatchObject({ changed: true, firstPaidAt: periodo - 1000 });
    const again = await send(event, { id: "msg_repetido" });
    expect(await again.json()).toMatchObject({ duplicate: true });
  });

  it("un pago posterior no mueve la fecha del primero, ni la prueba gratuita la fija", async () => {
    await send({ type: "paymentAttempt.updated", data: { status: "paid", paid_at: periodo + 86400000, payer: { user_id: "user_tok-nico" } } });
    expect((await userOf("nico@ejemplo.test"))!.firstPaidAt).toBe(periodo - 1000);
    await send({
      type: "subscriptionItem.active",
      data: { status: "active", plan: { slug: "formacion" }, is_free_trial: true, period_start: periodo + 1, payer: { user_id: "user_tok-mar" } },
    });
    const mar = (await userOf("mar@ejemplo.test"))!;
    expect(mar.plan).toBe("formacion");
    expect(mar.firstPaidAt).toBeNull();
  });

  it("si solo queda activo el plan gratuito de Clerk, el plan de pago se retira", async () => {
    await send({
      type: "subscription.updated",
      data: {
        status: "active",
        payer: { user_id: "user_tok-nico" },
        items: [
          { status: "ended", plan: { slug: "excursion" } },
          { status: "active", plan: { slug: "free_user" } },
        ],
      },
    });
    const nico = (await userOf("nico@ejemplo.test"))!;
    expect(nico.plan).toBeNull();
    expect(nico.firstPaidAt).toBe(periodo - 1000);
  });

  it("los eventos que no se usan se aceptan sin tocar nada", async () => {
    const res = await send({ type: "session.created", data: { id: "sess_x" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: true });
  });
});

describe("user.deleted", () => {
  it("borra lo que era solo suyo, deja lo compartido sin su nombre y lo audita", async () => {
    const lola = (await userOf("lola@ejemplo.test"))!;
    const mar = (await userOf("mar@ejemplo.test"))!;
    const propia = (await db.select().from(orgMembers).where(eq(orgMembers.userId, lola.id)))[0]!.orgId;
    const now = Date.now();

    // Su organización: un proyecto publicado, un medio en el almacenamiento y una respuesta de formulario
    await db.insert(projects).values({ id: "p-lola", orgId: propia, title: "Casa", slug: "casa", createdBy: lola.id, createdAt: now, updatedAt: now });
    await db.insert(publications).values({ projectId: "p-lola", versionId: "v1", slug: "casa-de-lola", publishedAt: now, publishedBy: lola.id });
    await runtime.storage.put("pub/casa-de-lola/current.json", "{}");
    await runtime.kv.put("pub:casa-de-lola", "p-lola");
    await db.insert(media).values({
      id: "m-lola", orgId: propia, kind: "image", filename: "a.jpg", mime: "image/jpeg", bytes: 3,
      r2Key: `media/${propia}/m-lola/original.jpg`, status: "ready", createdBy: lola.id, createdAt: now,
    });
    await runtime.storage.put(`media/${propia}/m-lola/original.jpg`, new Uint8Array([1, 2, 3]));
    await db.insert(formSubmissions).values({ id: "f-lola", projectId: "p-lola", hotspotId: "h", dataJson: "{}", createdAt: now });

    // Una organización compartida con Mar, de la que responde Lola
    const compartida = (await (await call("tok-lola", "/api/v1/orgs", { method: "POST", body: { name: "Taller compartido" } })).json()) as { id: string };
    await db.insert(orgMembers).values({ orgId: compartida.id, userId: mar.id, role: "admin", createdAt: now + 1 });
    await db.insert(projects).values({ id: "p-taller", orgId: compartida.id, title: "Taller", slug: "taller", createdBy: lola.id, createdAt: now, updatedAt: now });
    await db.insert(comments).values({ id: "c-lola", projectId: "p-taller", authorId: lola.id, body: "Revisad la escena 2", createdAt: now, updatedAt: now });

    const res = await send({ type: "user.deleted", data: { id: "user_tok-lola", deleted: true, object: "user" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: true, orgsDeleted: 1, orgsLeft: 1, projectsDeleted: 1, mediaDeleted: 1, ownershipTransferred: 1 });

    expect(await userOf("lola@ejemplo.test")).toBeUndefined();
    expect(await db.select().from(orgs).where(eq(orgs.id, propia))).toHaveLength(0);
    expect(await db.select().from(projects).where(eq(projects.id, "p-lola"))).toHaveLength(0);
    expect(await db.select().from(formSubmissions).where(eq(formSubmissions.id, "f-lola"))).toHaveLength(0);
    expect(await runtime.storage.head(`media/${propia}/m-lola/original.jpg`)).toBeNull();
    expect(await runtime.storage.head("pub/casa-de-lola/current.json")).toBeNull();
    expect(await runtime.kv.get("pub:casa-de-lola")).toBeNull();

    const taller = (await db.select().from(orgs).where(eq(orgs.id, compartida.id)))[0]!;
    expect(taller.ownerId).toBe(mar.id);
    expect(await db.select().from(projects).where(eq(projects.id, "p-taller"))).toHaveLength(1);
    expect((await db.select().from(comments).where(eq(comments.id, "c-lola")))[0]!.authorId).toBe(ANONYMOUS_AUTHOR);

    const auditado = (await db.select().from(auditLog).where(eq(auditLog.action, "user.deleted")))[0]!;
    expect(auditado.entityId).toBe(lola.id);
    expect(JSON.parse(auditado.detailJson!)).toMatchObject({ via: "clerk_webhook", orgsDeleted: 1 });

    // Un borrado de alguien que no existe aquí no falla
    const otro = await send({ type: "user.deleted", data: { id: "user_desconocido", deleted: true } });
    expect(await otro.json()).toMatchObject({ deleted: false });
  });
});
