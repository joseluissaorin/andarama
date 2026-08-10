import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../lib/context.js";
import { notFound } from "../lib/errors.js";
import { requireAuth } from "../lib/session.js";
import { rateLimit, clientIp } from "../lib/helpers.js";

/**
 * Sugerencia de texto alternativo con Workers AI (§2.11), siempre revisable
 * por la persona editora. Solo disponible en despliegues Cloudflare con el
 * binding AI configurado; en su ausencia devuelve 404 y el Studio oculta el
 * boton.
 */
export function aiRoutes(getAi: () => { run(model: string, input: Record<string, unknown>): Promise<unknown> } | null): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post("/alt-text", async (c) => {
    requireAuth(c);
    const ai = getAi();
    if (ai == null) throw notFound("Workers AI no configurado en esta instancia");
    await rateLimit(c.get("runtime").kv, `ai:${clientIp(c)}`, 30, 3600);
    const { imageUrl } = z.object({ imageUrl: z.string().max(500) }).parse(await c.req.json());
    // Solo imagenes de la propia instancia (rutas de la API de medios)
    if (!imageUrl.startsWith("/api/v1/media/")) throw notFound("Solo medios de la instancia");
    const imageRes = await c.get("runtime").storage.getBytes(await resolveMediaKey(c, imageUrl));
    if (imageRes == null) throw notFound("Medio no encontrado");
    const result = (await ai.run("@cf/llava-hf/llava-1.5-7b-hf", {
      image: [...imageRes.slice(0, 1024 * 1024)],
      prompt:
        "Describe brevemente esta imagen panoramica en espanol para una persona que no puede verla (texto alternativo, maximo 2 frases).",
      max_tokens: 120,
    })) as { description?: string; response?: string };
    return c.json({ suggestion: (result.description ?? result.response ?? "").trim() });
  });

  return r;
}

async function resolveMediaKey(c: { get: (k: "db") => any }, imageUrl: string): Promise<string> {
  const m = /^\/api\/v1\/media\/([A-Za-z0-9_-]+)\/(file|derived\/thumb)/.exec(imageUrl);
  if (m == null) throw notFound();
  const db = c.get("db");
  const { media, mediaDerivatives } = await import("@andarama/db");
  const { and, eq } = await import("drizzle-orm");
  if (m[2] === "file") {
    const row = (await db.select().from(media).where(eq(media.id, m[1]!)).limit(1))[0];
    if (row == null) throw notFound();
    return row.r2Key;
  }
  const der = (await db
    .select()
    .from(mediaDerivatives)
    .where(and(eq(mediaDerivatives.mediaId, m[1]!), eq(mediaDerivatives.kind, "thumb")))
    .limit(1))[0];
  if (der == null) throw notFound();
  return der.r2Prefix;
}
