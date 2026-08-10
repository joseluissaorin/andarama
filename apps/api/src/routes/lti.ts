import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ltiRegistrations, publications } from "@andarama/db";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { newId, newToken, nowMs, parseJson } from "../lib/util.js";
import { requireAuth } from "../lib/session.js";
import { isInstanceAdmin } from "../lib/authz.js";

/**
 * LTI 1.3 Advantage (§2.16): OIDC login initiation, launch (Resource Link),
 * Deep Linking 2.0 (seleccion de tour desde Moodle) y Assignment & Grade
 * Services (devolucion de la puntuacion del quiz al libro de calificaciones).
 */

interface LaunchContext {
  registrationId: string;
  issuer: string;
  clientId: string;
  sub: string;
  name?: string;
  ags?: { lineitem?: string; lineitems?: string; scope: string[] };
  slug: string;
}

export function ltiRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  /** JWKS de la herramienta (claves publicas para la plataforma). */
  r.get("/jwks", async (c) => {
    const db = c.get("db");
    const regs = await db.select().from(ltiRegistrations);
    const { exportJWK, importPKCS8 } = await import("jose");
    const keys = [];
    for (const reg of regs) {
      const keyData = parseJson<{ pkcs8: string; kid: string }>(reg.toolKeyJson, { pkcs8: "", kid: "" });
      if (keyData.pkcs8 === "") continue;
      try {
        const key = await importPKCS8(keyData.pkcs8, "RS256");
        const jwk = await exportJWK(key);
        // Solo la parte publica
        keys.push({ kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", use: "sig", kid: keyData.kid });
      } catch {
        // clave corrupta: se omite
      }
    }
    return c.json({ keys });
  });

  /** OIDC login initiation (plataforma -> herramienta). */
  r.on(["GET", "POST"], "/login", async (c) => {
    const db = c.get("db");
    const runtime = c.get("runtime");
    const params = c.req.method === "POST" ? await c.req.parseBody() : Object.fromEntries(new URL(c.req.url).searchParams);
    const iss = String(params.iss ?? "");
    const loginHint = String(params.login_hint ?? "");
    const targetLinkUri = String(params.target_link_uri ?? "");
    const clientId = String(params.client_id ?? "");
    const ltiMessageHint = params.lti_message_hint != null ? String(params.lti_message_hint) : undefined;
    if (iss === "" || loginHint === "") throw badRequest("Petición de login LTI incompleta");
    const reg = (await db
      .select()
      .from(ltiRegistrations)
      .where(clientId !== "" ? and(eq(ltiRegistrations.issuer, iss), eq(ltiRegistrations.clientId, clientId)) : eq(ltiRegistrations.issuer, iss))
      .limit(1))[0];
    if (reg == null) throw forbidden("Plataforma LTI no registrada");
    const state = newToken(16);
    const nonce = newToken(16);
    await runtime.kv.put(`lti-state:${state}`, JSON.stringify({ nonce, registrationId: reg.id }), { ttlSeconds: 600 });
    const url = new URL(reg.authUrl);
    url.searchParams.set("scope", "openid");
    url.searchParams.set("response_type", "id_token");
    url.searchParams.set("response_mode", "form_post");
    url.searchParams.set("prompt", "none");
    url.searchParams.set("client_id", reg.clientId);
    url.searchParams.set("redirect_uri", `${c.get("config").publicUrl}/api/v1/lti/launch`);
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("login_hint", loginHint);
    if (ltiMessageHint != null) url.searchParams.set("lti_message_hint", ltiMessageHint);
    if (targetLinkUri !== "") url.searchParams.set("target_link_uri", targetLinkUri);
    return c.redirect(url.toString());
  });

  /** Launch: valida el id_token y redirige al tour o al selector deep linking. */
  r.post("/launch", async (c) => {
    const db = c.get("db");
    const runtime = c.get("runtime");
    const body = await c.req.parseBody();
    const idToken = String(body.id_token ?? "");
    const state = String(body.state ?? "");
    if (idToken === "" || state === "") throw badRequest("Launch LTI incompleto");
    const stateData = parseJson<{ nonce: string; registrationId: string } | null>(await runtime.kv.get(`lti-state:${state}`), null);
    if (stateData == null) throw forbidden("Estado LTI inválido o caducado");
    await runtime.kv.delete(`lti-state:${state}`);
    const reg = (await db.select().from(ltiRegistrations).where(eq(ltiRegistrations.id, stateData.registrationId)).limit(1))[0];
    if (reg == null) throw forbidden("Registro LTI no encontrado");

    const { createRemoteJWKSet, jwtVerify } = await import("jose");
    const jwks = createRemoteJWKSet(new URL(reg.jwksUrl));
    const { payload } = await jwtVerify(idToken, jwks, { issuer: reg.issuer, audience: reg.clientId });
    if (payload.nonce !== stateData.nonce) throw forbidden("Nonce LTI inválido");

    const messageType = payload["https://purl.imsglobal.org/spec/lti/claim/message_type"];
    if (messageType === "LtiDeepLinkingRequest") {
      return deepLinkingPicker(c, reg.id, payload as Record<string, unknown>);
    }

    // Resource Link launch
    const target = String(payload["https://purl.imsglobal.org/spec/lti/claim/target_link_uri"] ?? "");
    const custom = (payload["https://purl.imsglobal.org/spec/lti/claim/custom"] ?? {}) as Record<string, string>;
    let slug = custom.tour ?? "";
    if (slug === "" && target !== "") {
      const m = /\/t\/([^/?#]+)/.exec(target);
      if (m != null) slug = m[1]!;
    }
    if (slug === "") throw badRequest("El launch no indica ningún tour (custom.tour)");
    const ags = payload["https://purl.imsglobal.org/spec/lti-ags/claim/endpoint"] as
      | { lineitem?: string; lineitems?: string; scope?: string[] }
      | undefined;
    const launchId = newToken(16);
    const launch: LaunchContext = {
      registrationId: reg.id,
      issuer: reg.issuer,
      clientId: reg.clientId,
      sub: String(payload.sub),
      name: typeof payload.name === "string" ? payload.name : undefined,
      ags: ags != null ? { lineitem: ags.lineitem, lineitems: ags.lineitems, scope: ags.scope ?? [] } : undefined,
      slug,
    };
    await runtime.kv.put(`lti-launch:${launchId}`, JSON.stringify(launch), { ttlSeconds: 6 * 3600 });
    return c.redirect(`/t/${slug}?lti=${launchId}${launch.name != null ? `&name=${encodeURIComponent(launch.name)}` : ""}`);
  });

  /** Respuesta de Deep Linking: firma el JWT con la clave de la herramienta. */
  r.post("/deeplink", async (c) => {
    const db = c.get("db");
    const body = await c.req.parseBody();
    const registrationId = String(body.registrationId ?? "");
    const slug = String(body.slug ?? "");
    const returnUrl = String(body.returnUrl ?? "");
    const deploymentId = String(body.deploymentId ?? "");
    const dataToken = String(body.data ?? "");
    if (registrationId === "" || slug === "" || returnUrl === "") throw badRequest("Deep link incompleto");
    const reg = (await db.select().from(ltiRegistrations).where(eq(ltiRegistrations.id, registrationId)).limit(1))[0];
    if (reg == null) throw notFound();
    const pub = (await db.select().from(publications).where(eq(publications.slug, slug)).limit(1))[0];
    if (pub == null) throw notFound("Tour no publicado");

    const keyData = parseJson<{ pkcs8: string; kid: string }>(reg.toolKeyJson, { pkcs8: "", kid: "" });
    const { importPKCS8, SignJWT } = await import("jose");
    const key = await importPKCS8(keyData.pkcs8, "RS256");
    const publicUrl = c.get("config").publicUrl;
    const contentItem = {
      type: "ltiResourceLink",
      title: pub.slug,
      url: `${publicUrl}/api/v1/lti/launch`,
      custom: { tour: slug },
      lineItem: { scoreMaximum: 100, label: `Tour ${slug}` },
    };
    const jwt = await new SignJWT({
      iss: reg.clientId,
      aud: reg.issuer,
      nonce: newToken(12),
      "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiDeepLinkingResponse",
      "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
      "https://purl.imsglobal.org/spec/lti/claim/deployment_id": deploymentId,
      "https://purl.imsglobal.org/spec/lti-dl/claim/content_items": [contentItem],
      ...(dataToken !== "" ? { "https://purl.imsglobal.org/spec/lti-dl/claim/data": dataToken } : {}),
    })
      .setProtectedHeader({ alg: "RS256", kid: keyData.kid })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(key);

    return c.html(`<!doctype html><html><body>
<form id="f" method="post" action="${escapeAttr(returnUrl)}">
<input type="hidden" name="JWT" value="${escapeAttr(jwt)}">
</form><script>document.getElementById("f").submit();</script></body></html>`);
  });

  // ------- Administracion de registros LTI (admin de instancia) -------

  r.get("/registrations", async (c) => {
    const auth = requireAuth(c);
    if (!isInstanceAdmin(auth.user)) throw forbidden();
    const db = c.get("db");
    const rows = await db.select().from(ltiRegistrations);
    return c.json(
      rows.map((row) => ({
        id: row.id,
        issuer: row.issuer,
        clientId: row.clientId,
        deploymentId: row.deploymentId,
        authUrl: row.authUrl,
        tokenUrl: row.tokenUrl,
        jwksUrl: row.jwksUrl,
        createdAt: row.createdAt,
        toolEndpoints: {
          login: `${c.get("config").publicUrl}/api/v1/lti/login`,
          launch: `${c.get("config").publicUrl}/api/v1/lti/launch`,
          jwks: `${c.get("config").publicUrl}/api/v1/lti/jwks`,
          deepLinking: `${c.get("config").publicUrl}/api/v1/lti/launch`,
        },
      })),
    );
  });

  r.post("/registrations", async (c) => {
    const auth = requireAuth(c);
    if (!isInstanceAdmin(auth.user)) throw forbidden();
    const db = c.get("db");
    const body = z
      .object({
        issuer: z.string().url(),
        clientId: z.string().min(1),
        deploymentId: z.string().optional(),
        authUrl: z.string().url(),
        tokenUrl: z.string().url(),
        jwksUrl: z.string().url(),
      })
      .parse(await c.req.json());
    // Generar par de claves RSA de la herramienta
    const { generateKeyPair, exportPKCS8 } = await import("jose");
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const pkcs8 = await exportPKCS8(privateKey);
    const kid = newToken(8);
    const id = newId();
    await db.insert(ltiRegistrations).values({
      id,
      issuer: body.issuer,
      clientId: body.clientId,
      deploymentId: body.deploymentId ?? null,
      authUrl: body.authUrl,
      tokenUrl: body.tokenUrl,
      jwksUrl: body.jwksUrl,
      toolKeyJson: JSON.stringify({ pkcs8, kid }),
      createdAt: nowMs(),
    });
    return c.json({ id }, 201);
  });

  r.delete("/registrations/:id", async (c) => {
    const auth = requireAuth(c);
    if (!isInstanceAdmin(auth.user)) throw forbidden();
    await c.get("db").delete(ltiRegistrations).where(eq(ltiRegistrations.id, c.req.param("id")));
    return c.json({ ok: true });
  });

  return r;
}

/** Selector de tours publicados para Deep Linking. */
async function deepLinkingPicker(c: any, registrationId: string, payload: Record<string, unknown>): Promise<Response> {
  const db = c.get("db");
  const pubs = await db.select().from(publications);
  const settings = payload["https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"] as
    | { deep_link_return_url?: string; data?: string }
    | undefined;
  const deploymentId = String(payload["https://purl.imsglobal.org/spec/lti/claim/deployment_id"] ?? "");
  const returnUrl = settings?.deep_link_return_url ?? "";
  const rows = (pubs as { slug: string }[])
    .map(
      (p) => `<li><form method="post" action="/api/v1/lti/deeplink">
<input type="hidden" name="registrationId" value="${escapeAttr(registrationId)}">
<input type="hidden" name="slug" value="${escapeAttr(p.slug)}">
<input type="hidden" name="returnUrl" value="${escapeAttr(returnUrl)}">
<input type="hidden" name="deploymentId" value="${escapeAttr(deploymentId)}">
<input type="hidden" name="data" value="${escapeAttr(settings?.data ?? "")}">
<button type="submit">${escapeHtml(p.slug)}</button></form></li>`,
    )
    .join("\n");
  return c.html(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Elegir tour</title>
<style>body{font-family:system-ui;background:#f6f7fb;color:#1c2340;padding:32px;max-width:640px;margin:0 auto}
h1{font-size:20px}ul{list-style:none;padding:0}li{margin:8px 0}
button{width:100%;text-align:left;padding:14px 18px;border:1px solid #d8dcea;border-radius:10px;background:#fff;font-size:15px;cursor:pointer}
button:hover{border-color:#5c68a5;background:#eef0f7}</style></head>
<body><h1>Elige el tour a incrustar en el curso</h1><ul>${rows}</ul></body></html>`);
}

/** Devolucion de calificacion AGS (la llama el endpoint publico de quiz). */
export async function sendAgsScore(
  c: { get: (k: "db" | "config") => any },
  launchJson: string,
  score: number,
  maxScore: number,
): Promise<void> {
  try {
    const launch = JSON.parse(launchJson) as LaunchContext;
    if (launch.ags?.lineitem == null) return;
    const db = c.get("db");
    const reg = (await db.select().from(ltiRegistrations).where(eq(ltiRegistrations.id, launch.registrationId)).limit(1))[0];
    if (reg == null) return;
    const keyData = parseJson<{ pkcs8: string; kid: string }>(reg.toolKeyJson, { pkcs8: "", kid: "" });
    const { importPKCS8, SignJWT } = await import("jose");
    const key = await importPKCS8(keyData.pkcs8, "RS256");
    // client_credentials con client_assertion JWT
    const assertion = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: keyData.kid })
      .setIssuer(reg.clientId)
      .setSubject(reg.clientId)
      .setAudience(reg.tokenUrl)
      .setIssuedAt()
      .setJti(newToken(12))
      .setExpirationTime("5m")
      .sign(key);
    const tokenRes = await fetch(reg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion: assertion,
        scope: "https://purl.imsglobal.org/spec/lti-ags/scope/score",
      }),
    });
    if (!tokenRes.ok) {
      console.error(`[lti] token AGS fallo: ${tokenRes.status} ${await tokenRes.text()}`);
      return;
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const scoreUrl = launch.ags.lineitem.includes("?")
      ? launch.ags.lineitem.replace("?", "/scores?")
      : `${launch.ags.lineitem}/scores`;
    const res = await fetch(scoreUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${access_token}`,
        "content-type": "application/vnd.ims.lis.v1.score+json",
      },
      body: JSON.stringify({
        userId: launch.sub,
        scoreGiven: score,
        scoreMaximum: Math.max(1, maxScore),
        activityProgress: "Completed",
        gradingProgress: "FullyGraded",
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      console.error(`[lti] envio de score fallo: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("[lti] error en AGS:", err);
  }
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replaceAll('"', "&quot;");
}
