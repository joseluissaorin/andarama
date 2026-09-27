import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { users } from "@andarama/db";
import type { AppEnv, UserRow } from "../lib/context.js";
import { badRequest, notFound, unauthorized } from "../lib/errors.js";
import { audit } from "../lib/helpers.js";
import { isPlanSlug, type PlanSlug } from "../lib/plans.js";
import { svixVerify } from "../lib/svix.js";
import { deleteUserData } from "../lib/account-deletion.js";
import { nowMs } from "../lib/util.js";

/**
 * Webhooks de Clerk (instancia alojada), firmados con Svix y el secreto
 * `CLERK_WEBHOOK_SECRET`:
 *
 * - `user.deleted`: la persona borró su cuenta en Clerk; aquí se borran o
 *   anonimizan sus datos (ver `account-deletion.ts`).
 * - `subscription.*`, `subscriptionItem.*` y `paymentAttempt.*` de Clerk
 *   Billing: se copia el plan y se fecha el primer pago real
 *   (`users.first_paid_at`), que el token de sesión no trae.
 *
 * Clerk reintenta lo que no recibe un 2xx; cada mensaje se procesa una sola
 * vez gracias a su `svix-id`.
 */

interface ClerkEvent {
  type: string;
  data: Record<string, unknown>;
}

interface BillingItem {
  status?: string;
  plan?: { slug?: string } | null;
  period_start?: number | null;
  is_free_trial?: boolean;
}

/** Clerk manda milisegundos; por si acaso, los segundos también se aceptan. */
function toMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value < 1e12 ? value * 1000 : value;
}

function payerUserId(data: Record<string, unknown>): string | null {
  const payer = data.payer as { user_id?: unknown } | undefined;
  if (typeof payer?.user_id === "string") return payer.user_id;
  if (typeof data.user_id === "string") return data.user_id;
  return null;
}

function paidSlug(item: BillingItem): PlanSlug | null {
  const slug = item.plan?.slug;
  return isPlanSlug(slug) ? slug : null;
}

const ENDED = new Set(["ended", "expired", "abandoned", "incomplete"]);

export function clerkWebhookRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post("/clerk", async (c) => {
    const config = c.get("config");
    if (config.clerkWebhookSecret == null || config.clerkWebhookSecret === "") throw notFound("Webhook de Clerk no configurado");
    const raw = await c.req.text();
    const svixId = c.req.header("svix-id");
    const ok = await svixVerify(config.clerkWebhookSecret, {
      id: svixId,
      timestamp: c.req.header("svix-timestamp"),
      signature: c.req.header("svix-signature"),
    }, raw);
    if (!ok) throw unauthorized("Firma del webhook no válida");

    const kv = c.get("runtime").kv;
    const seenKey = `clerk-webhook:${svixId}`;
    if ((await kv.get(seenKey)) != null) return c.json({ ok: true, duplicate: true });

    let event: ClerkEvent;
    try {
      event = JSON.parse(raw) as ClerkEvent;
    } catch {
      throw badRequest("Cuerpo del webhook no válido");
    }
    if (typeof event.type !== "string" || event.data == null || typeof event.data !== "object") throw badRequest("Evento de Clerk incompleto");

    let result: Record<string, unknown>;
    if (event.type === "user.deleted") {
      result = await onUserDeleted(c, event.data);
    } else if (/^(subscription|subscriptionItem|paymentAttempt)\./.test(event.type)) {
      result = await onBilling(c, event);
    } else {
      result = { ignored: true };
    }
    await kv.put(seenKey, "1", { ttlSeconds: 3 * 24 * 3600 });
    return c.json({ ok: true, type: event.type, ...result });
  });

  return r;
}

async function userByClerkId(c: { get: (k: "db") => AppEnv["Variables"]["db"] }, clerkId: string | null): Promise<UserRow | null> {
  if (clerkId == null) return null;
  return (await c.get("db").select().from(users).where(eq(users.clerkId, clerkId)).limit(1))[0] ?? null;
}

async function onUserDeleted(c: any, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const clerkId = typeof data.id === "string" ? data.id : null;
  const user = await userByClerkId(c, clerkId);
  if (user == null) return { deleted: false };
  const summary = await deleteUserData(c.get("db"), c.get("runtime"), user.id);
  await audit(c, "user.deleted", "user", user.id, { via: "clerk_webhook", ...summary }, undefined, null);
  return { deleted: true, ...summary };
}

async function onBilling(c: any, event: ClerkEvent): Promise<Record<string, unknown>> {
  const data = event.data;
  const user = await userByClerkId(c, payerUserId(data));
  if (user == null) return { matched: false };
  const db = c.get("db");
  const patch: Partial<UserRow> = {};
  let firstPaid: number | null = null;

  if (event.type.startsWith("paymentAttempt.")) {
    // El pago cobrado es la fecha más fiable
    if (data.status === "paid") firstPaid = toMs(data.paid_at) ?? toMs(data.updated_at) ?? nowMs();
  } else {
    const items: BillingItem[] = event.type.startsWith("subscription.")
      ? Array.isArray(data.items) ? (data.items as BillingItem[]) : []
      : [data as BillingItem];
    const active = items.filter((i) => i.status === "active");
    const activePaid = active.find((i) => paidSlug(i) != null);
    if (activePaid != null) {
      patch.plan = paidSlug(activePaid);
      if (activePaid.is_free_trial !== true) {
        firstPaid = toMs(activePaid.period_start) ?? toMs(data.created_at) ?? nowMs();
      }
    } else if (event.type.startsWith("subscription.") && active.length > 0) {
      // Solo queda activo el plan gratuito de Clerk: sin plan de pago
      patch.plan = null;
    } else if (event.type.startsWith("subscriptionItem.")) {
      const item = data as BillingItem;
      const slug = paidSlug(item);
      if (slug != null && item.status != null && ENDED.has(item.status) && user.plan === slug) patch.plan = null;
    }
  }

  if (firstPaid != null && (user.firstPaidAt == null || firstPaid < user.firstPaidAt)) patch.firstPaidAt = firstPaid;
  const planChanged = patch.plan !== undefined && patch.plan !== user.plan;
  if (!planChanged) delete patch.plan;
  if (Object.keys(patch).length === 0) return { changed: false };
  await db
    .update(users)
    .set({ ...patch, ...(planChanged ? { planUpdatedAt: nowMs() } : {}), updatedAt: nowMs() })
    .where(eq(users.id, user.id));
  await audit(c, "billing.clerk_webhook", "user", user.id, { type: event.type, ...patch }, undefined, user.id);
  return { changed: true, ...patch };
}
