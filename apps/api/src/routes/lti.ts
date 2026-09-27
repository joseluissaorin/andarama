import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ltiRegistrations, orgs, projects, publications } from "@andarama/db";
import { hmacSign, hmacVerify } from "@andarama/adapters";
import type { AppEnv } from "../lib/context.js";
import { ZodError } from "zod";
import { ApiError, badRequest, conflict, forbidden, notFound, problem, serverError } from "../lib/errors.js";
import { newId, newToken, nowMs, parseJson } from "../lib/util.js";
import { requireAuth } from "../lib/session.js";
import { isInstanceAdmin, requireOrgRole } from "../lib/authz.js";
import { orgIdOfSlug, requireOrgCapability } from "../lib/capabilities.js";
import { audit } from "../lib/helpers.js";

const LTI_VERSION = "1.3.0";
const CLAIM = "https://purl.imsglobal.org/spec/lti/claim/";
/** Vigencia del formulario firmado del selector de Deep Linking. */
export const DEEPLINK_TTL_SECONDS = 15 * 60;

/** Campos del formulario de Deep Linking que viajan por el navegador. */
export interface DeepLinkForm {
  registrationId: string;
  slug: string;
  returnUrl: string;
  deploymentId: string;
  data: string;
  /** Caducidad, en segundos desde epoch. */
  exp: number;
}

function deepLinkPayload(f: DeepLinkForm): string {
  return JSON.stringify(["lti-deeplink", f.registrationId, f.slug, f.returnUrl, f.deploymentId, f.data, f.exp]);
}

/** Firma HMAC del formulario con el secreto de la instancia. */
export async function signDeepLinkForm(secret: string, form: DeepLinkForm): Promise<string> {
  return hmacSign(secret, deepLinkPayload(form));
}

/** Verifica firma y caducidad; false si algo se tocó por el camino o ya caducó. */
export async function verifyDeepLinkForm(secret: string, form: DeepLinkForm, sig: string): Promise<boolean> {
  if (!Number.isFinite(form.exp) || form.exp < Math.floor(Date.now() / 1000)) return false;
  return hmacVerify(secret, deepLinkPayload(form), sig);
}

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

  // El login, el lanzamiento y el Deep Linking se abren dentro del LMS: un
  // error ahí tiene que verse como una página (y poder mostrarse en el iframe
  // de la plataforma), no como JSON bloqueado por X-Frame-Options.
  r.onError((err, c) => {
    const apiErr =
      err instanceof ApiError
        ? err
        : err instanceof ZodError
          ? badRequest("El cuerpo de la petición no es válido", { issues: err.issues })
          : null;
    if (apiErr == null) console.error("[lti] error no controlado:", err);
    const final = apiErr ?? serverError();
    if (wantsHtml(c.req.header("accept"))) return ltiErrorPage(final);
    return problem(c, final);
  });

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
    let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
    try {
      ({ payload } = await jwtVerify(idToken, jwks, { issuer: reg.issuer, audience: reg.clientId }));
    } catch (err) {
      // Firma, caducidad, emisor o JWKS inalcanzable: es un 403 explicable, no un 500
      throw forbidden(`La plataforma envió un mensaje que no se ha podido validar (${idTokenErrorText(err)})`);
    }
    if (payload.nonce !== stateData.nonce) throw forbidden("Nonce LTI inválido");

    // Versión, tipo de mensaje y despliegue: lo que no cuadre con el registro se rechaza
    if (payload[`${CLAIM}version`] !== LTI_VERSION) throw badRequest("Versión de LTI no admitida (se espera 1.3.0)");
    const messageType = payload[`${CLAIM}message_type`];
    if (messageType !== "LtiResourceLinkRequest" && messageType !== "LtiDeepLinkingRequest") {
      throw badRequest("Tipo de mensaje LTI no admitido");
    }
    const deploymentId = payload[`${CLAIM}deployment_id`];
    if (typeof deploymentId !== "string" || deploymentId === "") throw forbidden("El launch LTI no trae deployment_id");
    if (reg.deploymentId != null && reg.deploymentId !== "" && reg.deploymentId !== deploymentId) {
      throw forbidden("El deployment_id no corresponde a este registro LTI");
    }

    if (messageType === "LtiDeepLinkingRequest") {
      if (reg.orgId != null) await requireOrgCapability(db, c.get("config"), reg.orgId, "lti");
      return deepLinkingPicker(c, reg, payload as Record<string, unknown>);
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
    // En la instancia alojada, el LTI es de los planes de formación: manda el
    // plan de quien responde del recorrido. En el self-host no se limita.
    const orgId = await orgIdOfSlug(db, slug);
    // Un registro de organización solo lanza recorridos de esa organización
    if (reg.orgId != null && orgId !== reg.orgId) throw forbidden("Ese recorrido no pertenece a la organización de este registro LTI");
    if (orgId != null) await requireOrgCapability(db, c.get("config"), orgId, "lti");
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
    const form: DeepLinkForm = {
      registrationId: String(body.registrationId ?? ""),
      slug: String(body.slug ?? ""),
      returnUrl: String(body.returnUrl ?? ""),
      deploymentId: String(body.deploymentId ?? ""),
      data: String(body.data ?? ""),
      exp: Number.parseInt(String(body.exp ?? ""), 10),
    };
    const { registrationId, slug, returnUrl, deploymentId } = form;
    const dataToken = form.data;
    if (registrationId === "" || slug === "" || returnUrl === "") throw badRequest("Deep link incompleto");
    // El formulario lo firmó el selector: sin firma válida y vigente no se firma nada
    if (!(await verifyDeepLinkForm(c.get("config").secret, form, String(body.sig ?? "")))) {
      throw forbidden("Formulario de Deep Linking no válido o caducado");
    }
    const reg = (await db.select().from(ltiRegistrations).where(eq(ltiRegistrations.id, registrationId)).limit(1))[0];
    if (reg == null) throw notFound();
    const pub = (await db
      .select({ slug: publications.slug, title: projects.title })
      .from(publications)
      .innerJoin(projects, eq(publications.projectId, projects.id))
      .where(eq(publications.slug, slug))
      .limit(1))[0];
    if (pub == null) throw notFound("Tour no publicado");
    const pubOrg = await orgIdOfSlug(db, slug);
    if (reg.orgId == null || pubOrg !== reg.orgId) throw forbidden("Ese recorrido no pertenece a la organización de este registro LTI");
    await requireOrgCapability(db, c.get("config"), reg.orgId, "lti");

    const keyData = parseJson<{ pkcs8: string; kid: string }>(reg.toolKeyJson, { pkcs8: "", kid: "" });
    const { importPKCS8, SignJWT } = await import("jose");
    const key = await importPKCS8(keyData.pkcs8, "RS256");
    const publicUrl = c.get("config").publicUrl;
    // El título es el nombre que Moodle propone para la actividad
    const title = pub.title.trim() !== "" ? pub.title.trim() : pub.slug;
    const contentItem = {
      type: "ltiResourceLink",
      title,
      url: `${publicUrl}/api/v1/lti/launch`,
      custom: { tour: slug },
      lineItem: { scoreMaximum: 100, label: title },
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

    // La respuesta se envía sola a la plataforma: la CSP general (form-action
    // 'self', frame-ancestors 'self') la bloquearía dentro del LMS
    const nonce = c.get("cspNonce");
    c.header("content-security-policy", ltiPageCsp(nonce, reg.issuer, returnUrl));
    return c.html(`<!doctype html><html><body>
<form id="f" method="post" action="${escapeAttr(returnUrl)}">
<input type="hidden" name="JWT" value="${escapeAttr(jwt)}">
</form><script nonce="${nonce}">document.getElementById("f").submit();</script></body></html>`);
  });

  // ------- Registros LTI -------
  // El operador (administrador de la instancia) los ve y gestiona todos; el
  // administrador de una organización cliente da de alta y retira los de su
  // organización, si su plan incluye LTI.

  const toolEndpoints = (publicUrl: string): Record<string, string> => ({
    login: `${publicUrl}/api/v1/lti/login`,
    launch: `${publicUrl}/api/v1/lti/launch`,
    jwks: `${publicUrl}/api/v1/lti/jwks`,
    deepLinking: `${publicUrl}/api/v1/lti/launch`,
  });

  r.get("/registrations", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const orgId = c.req.query("orgId");
    let rows;
    if (orgId != null && orgId !== "") {
      await requireOrgRole(db, orgId, auth.user, "admin");
      rows = await db.select().from(ltiRegistrations).where(eq(ltiRegistrations.orgId, orgId));
    } else {
      if (!isInstanceAdmin(auth.user)) throw forbidden();
      rows = await db.select().from(ltiRegistrations);
    }
    const publicUrl = c.get("config").publicUrl;
    return c.json(
      rows.map((row) => ({
        id: row.id,
        orgId: row.orgId,
        issuer: row.issuer,
        clientId: row.clientId,
        deploymentId: row.deploymentId,
        authUrl: row.authUrl,
        tokenUrl: row.tokenUrl,
        jwksUrl: row.jwksUrl,
        createdAt: row.createdAt,
        toolEndpoints: toolEndpoints(publicUrl),
      })),
    );
  });

  r.post("/registrations", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const body = z
      .object({
        orgId: z.string().min(1).optional(),
        issuer: z.string().url(),
        clientId: z.string().min(1),
        deploymentId: z.string().optional(),
        authUrl: z.string().url(),
        tokenUrl: z.string().url(),
        jwksUrl: z.string().url(),
      })
      .parse(await c.req.json());
    if (!isInstanceAdmin(auth.user)) {
      // Cliente: su organización, como administrador, y con LTI en el plan
      if (body.orgId == null) throw badRequest("Indica la organización del registro LTI");
      await requireOrgRole(db, body.orgId, auth.user, "admin");
      await requireOrgCapability(db, c.get("config"), body.orgId, "lti");
    } else if (body.orgId != null) {
      const org = (await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.id, body.orgId)).limit(1))[0];
      if (org == null) throw notFound("Organización no encontrada");
    }
    const taken = (await db
      .select({ id: ltiRegistrations.id })
      .from(ltiRegistrations)
      .where(and(eq(ltiRegistrations.issuer, body.issuer), eq(ltiRegistrations.clientId, body.clientId)))
      .limit(1))[0];
    if (taken != null) throw conflict("Esa plataforma (emisor e identificador de cliente) ya está registrada");
    // Generar par de claves RSA de la herramienta
    const { generateKeyPair, exportPKCS8 } = await import("jose");
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const pkcs8 = await exportPKCS8(privateKey);
    const kid = newToken(8);
    const id = newId();
    await db.insert(ltiRegistrations).values({
      id,
      orgId: body.orgId ?? null,
      issuer: body.issuer,
      clientId: body.clientId,
      deploymentId: body.deploymentId ?? null,
      authUrl: body.authUrl,
      tokenUrl: body.tokenUrl,
      jwksUrl: body.jwksUrl,
      toolKeyJson: JSON.stringify({ pkcs8, kid }),
      createdAt: nowMs(),
    });
    await audit(c, "lti.registration_create", "lti_registration", id, { issuer: body.issuer, clientId: body.clientId }, body.orgId);
    return c.json({ id, toolEndpoints: toolEndpoints(c.get("config").publicUrl) }, 201);
  });

  /** El operador asigna un registro (por ejemplo, uno anterior a la columna) a una organización. */
  r.patch("/registrations/:id", async (c) => {
    const auth = requireAuth(c);
    if (!isInstanceAdmin(auth.user)) throw forbidden();
    const db = c.get("db");
    const body = z
      .object({ orgId: z.string().min(1).nullable(), deploymentId: z.string().nullable().optional() })
      .parse(await c.req.json());
    if (body.orgId != null) {
      const org = (await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.id, body.orgId)).limit(1))[0];
      if (org == null) throw notFound("Organización no encontrada");
    }
    await db
      .update(ltiRegistrations)
      .set({ orgId: body.orgId, ...(body.deploymentId !== undefined ? { deploymentId: body.deploymentId } : {}) })
      .where(eq(ltiRegistrations.id, c.req.param("id")));
    await audit(c, "lti.registration_update", "lti_registration", c.req.param("id"), body, body.orgId ?? undefined);
    return c.json({ ok: true });
  });

  r.delete("/registrations/:id", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const reg = (await db.select().from(ltiRegistrations).where(eq(ltiRegistrations.id, c.req.param("id"))).limit(1))[0];
    if (reg == null) throw notFound();
    if (!isInstanceAdmin(auth.user)) {
      if (reg.orgId == null) throw forbidden();
      await requireOrgRole(db, reg.orgId, auth.user, "admin");
    }
    await db.delete(ltiRegistrations).where(eq(ltiRegistrations.id, reg.id));
    await audit(c, "lti.registration_delete", "lti_registration", reg.id, { issuer: reg.issuer, clientId: reg.clientId }, reg.orgId ?? undefined);
    return c.json({ ok: true });
  });

  return r;
}

/**
 * Selector de tours publicados para Deep Linking: solo los de la
 * organización dueña del registro, y cada opción con su formulario firmado.
 */
async function deepLinkingPicker(
  c: any,
  reg: typeof ltiRegistrations.$inferSelect,
  payload: Record<string, unknown>,
): Promise<Response> {
  const db = c.get("db");
  const pubs: { slug: string; title: string }[] =
    reg.orgId == null
      ? []
      : await db
          .select({ slug: publications.slug, title: projects.title })
          .from(publications)
          .innerJoin(projects, eq(publications.projectId, projects.id))
          .where(eq(projects.orgId, reg.orgId));
  const settings = payload["https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"] as
    | { deep_link_return_url?: string; data?: string }
    | undefined;
  const deploymentId = String(payload[`${CLAIM}deployment_id`] ?? "");
  const returnUrl = settings?.deep_link_return_url ?? "";
  if (returnUrl === "") throw badRequest("La petición de Deep Linking no trae deep_link_return_url");
  const exp = Math.floor(Date.now() / 1000) + DEEPLINK_TTL_SECONDS;
  const secret = c.get("config").secret as string;
  const items: string[] = [];
  for (const p of pubs) {
    const form: DeepLinkForm = { registrationId: reg.id, slug: p.slug, returnUrl, deploymentId, data: settings?.data ?? "", exp };
    const sig = await signDeepLinkForm(secret, form);
    items.push(`<li><form method="post" action="/api/v1/lti/deeplink">
<input type="hidden" name="registrationId" value="${escapeAttr(form.registrationId)}">
<input type="hidden" name="slug" value="${escapeAttr(form.slug)}">
<input type="hidden" name="returnUrl" value="${escapeAttr(form.returnUrl)}">
<input type="hidden" name="deploymentId" value="${escapeAttr(form.deploymentId)}">
<input type="hidden" name="data" value="${escapeAttr(form.data)}">
<input type="hidden" name="exp" value="${exp}">
<input type="hidden" name="sig" value="${escapeAttr(sig)}">
<button type="submit">${escapeHtml(p.title !== "" ? p.title : p.slug)}</button></form></li>`);
  }
  const vacio =
    reg.orgId == null
      ? "<p>Este registro LTI no está asociado a ninguna organización. Pide al administrador de la instancia que lo asigne.</p>"
      : "<p>Tu organización todavía no tiene recorridos publicados.</p>";
  c.header("content-security-policy", ltiPageCsp(null, reg.issuer, null));
  return c.html(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Elegir recorrido</title>
<style>body{font-family:system-ui;background:#f6f7fb;color:#1c2340;padding:32px;max-width:640px;margin:0 auto}
h1{font-size:20px}ul{list-style:none;padding:0}li{margin:8px 0}
button{width:100%;text-align:left;padding:14px 18px;border:1px solid #d8dcea;border-radius:10px;background:#fff;font-size:15px;cursor:pointer}
button:hover{border-color:#5c68a5;background:#eef0f7}</style></head>
<body><h1>Elige el recorrido que quieres incrustar en el curso</h1>${items.length > 0 ? `<ul>${items.join("")}</ul>` : vacio}</body></html>`);
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

function originOf(url: string | null): string | null {
  if (url == null) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * CSP de las páginas LTI: se muestran dentro del LMS (iframe o ventana
 * modal) y la respuesta de Deep Linking envía un formulario a la plataforma.
 */
function ltiPageCsp(nonce: string | null, issuer: string, formTarget: string | null): string {
  const frame = originOf(issuer);
  const target = originOf(formTarget);
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    nonce != null ? `script-src 'nonce-${nonce}'` : "script-src 'none'",
    `form-action 'self'${target != null ? ` ${target}` : ""}`,
    `frame-ancestors 'self'${frame != null ? ` ${frame}` : ""}`,
    "base-uri 'none'",
  ].join("; ");
}

/** Texto breve del fallo al validar el id_token (sin volcar el token). */
export function idTokenErrorText(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  switch (code) {
    case "ERR_JWT_EXPIRED":
      return "el mensaje ha caducado; revisa la hora del servidor de la plataforma";
    case "ERR_JWT_CLAIM_VALIDATION_FAILED":
      return "el emisor o el identificador de cliente no coinciden con el registro";
    case "ERR_JWKS_NO_MATCHING_KEY":
    case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED":
      return "la firma no corresponde a las claves públicas registradas";
    case "ERR_JWKS_TIMEOUT":
    case "ERR_JWKS_INVALID":
      return "no se han podido leer las claves públicas de la plataforma";
    default:
      return err instanceof TypeError ? "no se han podido leer las claves públicas de la plataforma" : "firma no válida";
  }
}

/** El navegador pide HTML; un cliente de API o una prueba, no. */
export function wantsHtml(accept: string | undefined): boolean {
  return (accept ?? "").includes("text/html");
}

/**
 * Página de error de LTI: legible dentro del iframe del LMS. Se puede
 * enmarcar desde cualquier origen porque no tiene nada que proteger: ni
 * scripts, ni formularios, ni datos de la sesión.
 */
export function ltiErrorPage(err: ApiError): Response {
  const detalle = err.detail ?? err.title;
  const consejo =
    err.status === 403
      ? "Si eres docente o administras la plataforma, revisa el registro LTI en los ajustes de la organización de Andarama (emisor, identificador de cliente, identificador de despliegue y URL de claves)."
      : "Vuelve a abrir la actividad desde el curso. Si el problema continúa, avisa a quien administra la plataforma.";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>No se ha podido abrir el recorrido</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui,sans-serif;background:#f6f7fb;color:#1c2340;padding:32px;max-width:640px;margin:0 auto;line-height:1.5}
h1{font-size:20px}.detalle{background:#fff;border:1px solid #d8dcea;border-radius:10px;padding:14px 18px}small{color:#5c6480}</style></head>
<body><h1>No se ha podido abrir el recorrido</h1><p class="detalle">${escapeHtml(detalle)}</p><p>${consejo}</p>
<p><small>Andarama · LTI 1.3 · error ${err.status}</small></p></body></html>`;
  return new Response(html, {
    status: err.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors *",
    },
  });
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replaceAll('"', "&quot;");
}
