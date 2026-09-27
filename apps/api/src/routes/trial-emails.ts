import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { trialEmails, users } from "@andarama/db";
import type { AppEnv } from "../lib/context.js";
import { unsubscribeToken } from "../lib/trial-emails.js";
import { nowMs } from "../lib/util.js";

/**
 * Baja de los correos del ciclo de la prueba, sin sesión: el enlace lleva el
 * id del usuario y una firma con el secreto de la instancia.
 */
export function trialEmailRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/public/trial-emails/unsubscribe", async (c) => {
    const userId = c.req.query("u") ?? "";
    const token = c.req.query("t") ?? "";
    const pagina = (titulo: string, texto: string, status: 200 | 400): Response =>
      c.html(
        `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${titulo}</title>` +
          `<style>body{font-family:Georgia,serif;background:#F4F1EA;color:#1A1A1A;max-width:34rem;margin:12vh auto;padding:0 1.5rem;line-height:1.6}h1{font-size:1.4rem}</style></head>` +
          `<body><h1>${titulo}</h1><p>${texto}</p></body></html>`,
        status,
      );
    const esperado = await unsubscribeToken(c.get("config").secret, userId);
    if (userId === "" || token !== esperado) {
      return pagina("Enlace no válido", "Este enlace de baja no es válido o está incompleto. Link not valid.", 400);
    }
    const db = c.get("db");
    const existe = (await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1))[0];
    if (existe != null) {
      await db.insert(trialEmails).values({ userId, step: "baja", sentAt: nowMs() }).onConflictDoNothing();
    }
    return pagina(
      "Hecho: no recibirás más avisos de la prueba",
      "No te enviaremos más correos sobre la prueba de Andarama. Tu cuenta y tus recorridos siguen igual. / Done: you will not receive more trial reminders.",
      200,
    );
  });

  return app;
}
