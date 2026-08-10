import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { apiTokens } from "@andarama/db";
import type { AppEnv } from "../lib/context.js";
import { newId, newToken, nowMs, sha256Hex } from "../lib/util.js";
import { requireAuth } from "../lib/session.js";
import { audit } from "../lib/helpers.js";

const SCOPES = ["projects:read", "projects:write", "media:read", "media:write", "publish", "orgs:write", "admin"] as const;

/** Tokens personales con scopes para automatizacion/CI (§5.6). */
export function tokenRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const auth = requireAuth(c);
    const rows = await c.get("db").select().from(apiTokens).where(eq(apiTokens.userId, auth.user.id));
    return c.json(rows.map((t) => ({ id: t.id, name: t.name, scopes: JSON.parse(t.scopesJson), lastUsedAt: t.lastUsedAt, createdAt: t.createdAt })));
  });

  r.post("/", async (c) => {
    const auth = requireAuth(c);
    const body = z
      .object({ name: z.string().min(1).max(80), scopes: z.array(z.enum(SCOPES)).min(1) })
      .parse(await c.req.json());
    const token = `andarama_${newToken(24)}`;
    const id = newId();
    await c.get("db").insert(apiTokens).values({
      id,
      userId: auth.user.id,
      name: body.name,
      hash: await sha256Hex(token),
      scopesJson: JSON.stringify(body.scopes),
      createdAt: nowMs(),
    });
    await audit(c, "token.create", "api_token", id, { scopes: body.scopes });
    // El token solo se muestra una vez
    return c.json({ id, token }, 201);
  });

  r.delete("/:tokenId", async (c) => {
    const auth = requireAuth(c);
    await c
      .get("db")
      .delete(apiTokens)
      .where(and(eq(apiTokens.id, c.req.param("tokenId")), eq(apiTokens.userId, auth.user.id)));
    await audit(c, "token.delete", "api_token", c.req.param("tokenId"));
    return c.json({ ok: true });
  });

  return r;
}
