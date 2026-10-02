import { Hono, type Context } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { feedbackReports } from "@andarama/db";
import type { AppEnv } from "../lib/context.js";
import { badRequest, payloadTooLarge } from "../lib/errors.js";
import { newId, nowMs } from "../lib/util.js";
import { rateLimit, sniffMime } from "../lib/helpers.js";
import { requireAuth } from "../lib/session.js";

/**
 * «Informar de un problema» desde el Studio.
 *
 * Quien prueba la beta escribe qué ha pasado y, si quiere, adjunta una
 * captura. El Studio añade solo el contexto (dirección, proyecto, escena,
 * navegador, ventana y versión) para que el informe diga qué se probó. Se
 * guarda en `feedback_reports`, la captura en `feedback/<id>.<ext>` y se
 * avisa por el correo de la instancia a DEMO_NOTIFY_TO, como las demos.
 */

/** Tamaño máximo de la captura adjunta. */
export const FEEDBACK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Formatos de imagen admitidos y su extensión en el almacenamiento. */
const IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const feedbackContextSchema = z
  .object({
    url: z.string().max(2000).optional(),
    projectId: z.string().max(64).nullable().optional(),
    sceneId: z.string().max(64).nullable().optional(),
    userAgent: z.string().max(500).optional(),
    viewport: z.string().max(40).optional(),
    version: z.string().max(100).optional(),
    lang: z.string().max(10).optional(),
  })
  .strict();

export const feedbackSchema = z.object({
  description: z.string().trim().min(1).max(5000),
  context: feedbackContextSchema.optional(),
});

export type FeedbackContext = z.infer<typeof feedbackContextSchema>;

/**
 * Lee el cuerpo: JSON (sin captura) o multipart con `data` (el JSON) e
 * `image` (el fichero).
 */
async function leerCuerpo(c: Context<AppEnv>): Promise<{
  body: z.infer<typeof feedbackSchema>;
  image: File | null;
}> {
  const tipo = c.req.header("content-type") ?? "";
  if (tipo.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    const data = form.data;
    if (typeof data !== "string") throw badRequest("Falta el campo «data»");
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      throw badRequest("El campo «data» no es JSON");
    }
    const image = form.image;
    return { body: feedbackSchema.parse(json), image: image instanceof File && image.size > 0 ? image : null };
  }
  return { body: feedbackSchema.parse(await c.req.json()), image: null };
}

export function feedbackRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post("/feedback", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const runtime = c.get("runtime");
    const config = c.get("config");
    await rateLimit(runtime.kv, `feedback:${auth.user.id}`, 10, 3600);
    const { body, image } = await leerCuerpo(c);

    const id = newId();
    let imageKey: string | null = null;
    let imageMime: string | null = null;
    if (image != null) {
      if (image.size > FEEDBACK_IMAGE_MAX_BYTES) throw payloadTooLarge("La captura no puede pasar de 5 MB");
      const bytes = new Uint8Array(await image.arrayBuffer());
      // Manda el contenido, no lo que diga el navegador
      const mime = sniffMime(bytes.slice(0, 64));
      const ext = mime != null ? IMAGE_EXT[mime] : undefined;
      if (mime == null || ext == null) throw badRequest("La captura debe ser una imagen PNG, JPEG, WebP o GIF");
      imageKey = `feedback/${id}.${ext}`;
      imageMime = mime;
      await runtime.storage.put(imageKey, bytes, { contentType: mime });
    }

    const createdAt = nowMs();
    const context = body.context ?? {};
    await db.insert(feedbackReports).values({
      id,
      userId: auth.user.id,
      description: body.description,
      contextJson: JSON.stringify(context),
      imageKey,
      imageMime,
      createdAt,
    });

    const aviso = [
      `Nuevo informe de problema de ${auth.user.name} <${auth.user.email}>`,
      "",
      body.description,
      "",
      `Versión: ${context.version ?? "?"}`,
      `Dirección: ${context.url ?? "?"}`,
      `Proyecto: ${context.projectId ?? "-"}`,
      `Escena: ${context.sceneId ?? "-"}`,
      `Navegador: ${context.userAgent ?? "?"}`,
      `Ventana: ${context.viewport ?? "?"}`,
      `Captura: ${imageKey != null ? "sí (en el panel de administración, pestaña Problemas)" : "no"}`,
    ].join("\n");
    if (runtime.email.configured && config.demoNotifyTo != null && config.demoNotifyTo !== "") {
      const to = config.demoNotifyTo;
      const resumen = body.description.replace(/\s+/g, " ").slice(0, 60);
      runtime.deferred(
        runtime.email
          .send({ to, subject: `Problema: ${resumen}`, text: aviso })
          .then(() => db.update(feedbackReports).set({ notifiedAt: nowMs() }).where(eq(feedbackReports.id, id)))
          .catch((err: unknown) => console.error("[feedback] no se pudo enviar el aviso:", err)),
      );
    } else {
      console.log(`[feedback] informe ${id} de ${auth.user.email}; sin correo configurado, véase el panel`);
    }
    return c.json({ ok: true, id }, 201);
  });

  return r;
}
