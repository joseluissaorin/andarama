import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { SignJWT, decodeJwt, exportJWK, generateKeyPair } from "jose";
import { orgMembers, projects, publications, users } from "@andarama/db";
import { eq } from "drizzle-orm";
import type { Db } from "./lib/context.js";
import { signDeepLinkForm } from "./routes/lti.js";
import { TEST_SECRET, bearerCaller, createTestInstance, fakeClerk, type TestInstance } from "./test-support.js";

/**
 * LTI 1.3 con la plataforma simulada: su JWKS se sirve desde un servidor
 * local y sus id_token se firman aquí. Cubre el alta por el administrador de
 * una organización cliente (con la capacidad `lti` de su plan), el selector
 * de Deep Linking limitado a la organización del registro, el formulario
 * firmado con HMAC y la validación de deployment_id y versión.
 */

const ISSUER = "https://moodle.test";
const RETURN_URL = "https://moodle.test/mod/lti/contentitem_return.php";
const CLAIM = "https://purl.imsglobal.org/spec/lti/claim/";

const people = {
  "tok-op": { email: "operador@andarama.test", name: "Operador", plan: null },
  "tok-profe": { email: "profe@uni.test", name: "Profe", plan: "u:formacion" },
  "tok-paseo": { email: "paseo@ejemplo.test", name: "Paseante", plan: "u:paseo" },
};

let inst: TestInstance;
let db: Db;
let call: ReturnType<typeof bearerCaller>;
let jwks: Server;
let jwksUrl = "";
let platformKey: CryptoKey;
let profeOrg = "";
let paseoOrg = "";

async function orgOf(token: string): Promise<string> {
  const me = (await (await call(token, "/api/v1/me")).json()) as { orgs: { id: string }[] };
  return me.orgs[0]!.id;
}

async function publish(orgId: string, slug: string, title: string): Promise<void> {
  const now = Date.now();
  const owner = (await db.select().from(orgMembers).where(eq(orgMembers.orgId, orgId)))[0]!.userId;
  await db.insert(projects).values({ id: `p-${slug}`, orgId, title, slug, createdBy: owner, createdAt: now, updatedAt: now });
  await db.insert(publications).values({ projectId: `p-${slug}`, versionId: `v-${slug}`, slug, publishedAt: now, publishedBy: owner });
}

function registration(orgId: string | undefined, clientId: string): Record<string, unknown> {
  return {
    orgId,
    issuer: ISSUER,
    clientId,
    deploymentId: "dep-1",
    authUrl: `${ISSUER}/mod/lti/auth.php`,
    tokenUrl: `${ISSUER}/mod/lti/token.php`,
    jwksUrl,
  };
}

/** Inicio de sesión OIDC + id_token firmado por la plataforma + launch. */
async function launch(clientId: string, claims: Record<string, unknown>): Promise<Response> {
  const login = await inst.app.request(
    `http://localhost/api/v1/lti/login?iss=${encodeURIComponent(ISSUER)}&login_hint=alumno-1&client_id=${clientId}`,
  );
  expect(login.status).toBe(302);
  const location = new URL(login.headers.get("location")!);
  const state = location.searchParams.get("state")!;
  const nonce = location.searchParams.get("nonce")!;
  const idToken = await new SignJWT({
    nonce,
    [`${CLAIM}version`]: "1.3.0",
    [`${CLAIM}deployment_id`]: "dep-1",
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "plataforma-1" })
    .setIssuer(ISSUER)
    .setAudience(clientId)
    .setSubject("alumno-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(platformKey);
  return inst.app.request("http://localhost/api/v1/lti/launch", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, state }).toString(),
  });
}

const deepLinkRequest = {
  [`${CLAIM}message_type`]: "LtiDeepLinkingRequest",
  "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings": { deep_link_return_url: RETURN_URL, data: "opaco" },
};

function formsOf(html: string): Record<string, string>[] {
  return [...html.matchAll(/<form method="post" action="\/api\/v1\/lti\/deeplink">([\s\S]*?)<\/form>/g)].map((m) =>
    Object.fromEntries([...m[1]!.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map((f) => [f[1]!, f[2]!.replaceAll("&amp;", "&")])),
  );
}

async function postDeepLink(fields: Record<string, string>): Promise<Response> {
  return inst.app.request("http://localhost/api/v1/lti/deeplink", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  platformKey = pair.privateKey as CryptoKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "plataforma-1", alg: "RS256", use: "sig" };
  jwks = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((ok) => jwks.listen(0, "127.0.0.1", ok));
  jwksUrl = `http://127.0.0.1:${(jwks.address() as AddressInfo).port}/jwks`;

  inst = await createTestInstance(
    { clerk: { publishableKey: "pk_test_x", secretKey: "sk_test_x" }, adminEmails: ["operador@andarama.test"] },
    fakeClerk(people),
  );
  db = inst.db;
  call = bearerCaller(inst.app);
  await call("tok-op", "/api/v1/me");
  profeOrg = await orgOf("tok-profe");
  paseoOrg = await orgOf("tok-paseo");
  await publish(profeOrg, "museo-profe", "Museo de la profe");
  await publish(paseoOrg, "casa-paseo", "Casa del paseante");
});

afterAll(() => {
  jwks.close();
});

describe("alta de plataformas LTI", () => {
  it("el administrador de una organización con LTI en su plan registra su plataforma", async () => {
    const res = await call("tok-profe", "/api/v1/lti/registrations", { method: "POST", body: registration(profeOrg, "cliente-profe") });
    expect(res.status).toBe(201);
    const lista = (await (await call("tok-profe", `/api/v1/lti/registrations?orgId=${profeOrg}`)).json()) as { orgId: string; clientId: string }[];
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ orgId: profeOrg, clientId: "cliente-profe" });
    // Repetir emisor y cliente choca
    expect((await call("tok-profe", "/api/v1/lti/registrations", { method: "POST", body: registration(profeOrg, "cliente-profe") })).status).toBe(409);
  });

  it("sin LTI en el plan, sin ser administrador de la organización o sin organización, no", async () => {
    const sinPlan = await call("tok-paseo", "/api/v1/lti/registrations", { method: "POST", body: registration(paseoOrg, "cliente-paseo") });
    expect(sinPlan.status).toBe(403);
    expect(await sinPlan.json()).toMatchObject({ code: "capability", capability: "lti" });
    expect((await call("tok-paseo", "/api/v1/lti/registrations", { method: "POST", body: registration(profeOrg, "cliente-ajeno") })).status).toBe(403);
    expect((await call("tok-profe", "/api/v1/lti/registrations", { method: "POST", body: registration(undefined, "cliente-suelto") })).status).toBe(400);
    // El listado completo es solo del operador
    expect((await call("tok-profe", "/api/v1/lti/registrations")).status).toBe(403);
    expect((await call("tok-paseo", `/api/v1/lti/registrations?orgId=${profeOrg}`)).status).toBe(403);
    expect((await call("tok-op", "/api/v1/lti/registrations")).status).toBe(200);
  });

  it("el operador puede registrar para cualquier organización y asignar los registros antiguos", async () => {
    const res = await call("tok-op", "/api/v1/lti/registrations", { method: "POST", body: registration(undefined, "cliente-antiguo") });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    // Sin organización, el selector no ofrece nada
    const vacio = await launch("cliente-antiguo", deepLinkRequest);
    expect(vacio.status).toBe(200);
    expect(formsOf(await vacio.text())).toHaveLength(0);
    expect((await call("tok-op", `/api/v1/lti/registrations/${id}`, { method: "PATCH", body: { orgId: paseoOrg } })).status).toBe(200);
    expect((await call("tok-profe", `/api/v1/lti/registrations/${id}`, { method: "DELETE" })).status).toBe(403);
  });
});

describe("Deep Linking", () => {
  let forms: Record<string, string>[] = [];

  it("el selector solo lista los recorridos de la organización dueña del registro", async () => {
    const res = await launch("cliente-profe", deepLinkRequest);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Museo de la profe");
    expect(html).not.toContain("casa-paseo");
    forms = formsOf(html);
    expect(forms).toHaveLength(1);
    expect(forms[0]).toMatchObject({ slug: "museo-profe", returnUrl: RETURN_URL, deploymentId: "dep-1", data: "opaco" });
    expect(forms[0]!.sig).toMatch(/^[0-9a-f]{64}$/);
    expect(res.headers.get("content-security-policy")).toContain(`frame-ancestors 'self' ${ISSUER}`);
  });

  it("el formulario firmado devuelve el JWT a la plataforma", async () => {
    const res = await postDeepLink(forms[0]!);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`action="${RETURN_URL}"`);
    const jwt = /name="JWT" value="([^"]+)"/.exec(html)![1]!;
    const claims = decodeJwt(jwt);
    expect(claims[`${CLAIM}deployment_id`]).toBe("dep-1");
    expect(claims["https://purl.imsglobal.org/spec/lti-dl/claim/data"]).toBe("opaco");
    const items = claims["https://purl.imsglobal.org/spec/lti-dl/claim/content_items"] as { custom: { tour: string } }[];
    expect(items[0]!.custom.tour).toBe("museo-profe");
    expect(res.headers.get("content-security-policy")).toContain(`form-action 'self' ${ISSUER}`);
  });

  it("rechaza lo que se toque por el camino, lo caducado y lo ajeno aunque venga firmado", async () => {
    const base = forms[0]!;
    expect((await postDeepLink({ ...base, returnUrl: "https://malo.test/robar" })).status).toBe(403);
    expect((await postDeepLink({ ...base, slug: "casa-paseo" })).status).toBe(403);
    expect((await postDeepLink({ ...base, deploymentId: "otro" })).status).toBe(403);
    const { sig: _sig, ...sinFirma } = base;
    expect((await postDeepLink(sinFirma)).status).toBe(403);

    const caducado = { ...base, exp: String(Math.floor(Date.now() / 1000) - 5) };
    const firmaCaducada = await signDeepLinkForm(TEST_SECRET, { ...base, exp: Number(caducado.exp) } as never);
    expect((await postDeepLink({ ...caducado, sig: firmaCaducada })).status).toBe(403);

    // Aunque alguien consiguiera una firma válida, el recorrido tiene que ser de la organización
    const ajeno: Record<string, string> = { ...base, slug: "casa-paseo" };
    const firmaAjena = await signDeepLinkForm(TEST_SECRET, { ...ajeno, exp: Number(ajeno.exp) } as never);
    expect((await postDeepLink({ ...ajeno, sig: firmaAjena })).status).toBe(403);
  });
});

describe("validación del lanzamiento", () => {
  it("un recurso de la organización del registro se abre", async () => {
    const res = await launch("cliente-profe", {
      [`${CLAIM}message_type`]: "LtiResourceLinkRequest",
      [`${CLAIM}custom`]: { tour: "museo-profe" },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^\/t\/museo-profe\?lti=/);
  });

  it("un recurso de otra organización no", async () => {
    const res = await launch("cliente-profe", {
      [`${CLAIM}message_type`]: "LtiResourceLinkRequest",
      [`${CLAIM}custom`]: { tour: "casa-paseo" },
    });
    expect(res.status).toBe(403);
  });

  it("rechaza otro deployment_id, otra versión de LTI y tipos de mensaje desconocidos", async () => {
    const recurso = { [`${CLAIM}message_type`]: "LtiResourceLinkRequest", [`${CLAIM}custom`]: { tour: "museo-profe" } };
    expect((await launch("cliente-profe", { ...recurso, [`${CLAIM}deployment_id`]: "dep-falso" })).status).toBe(403);
    expect((await launch("cliente-profe", { ...recurso, [`${CLAIM}deployment_id`]: "" })).status).toBe(403);
    expect((await launch("cliente-profe", { ...recurso, [`${CLAIM}version`]: "1.1" })).status).toBe(400);
    expect((await launch("cliente-profe", { ...recurso, [`${CLAIM}message_type`]: "LtiSubmissionReviewRequest" })).status).toBe(400);
  });

  it("si el plan deja de incluir LTI, el lanzamiento se corta", async () => {
    people["tok-profe"].plan = "u:paseo";
    await call("tok-profe", "/api/v1/me");
    const profe = (await db.select().from(users).where(eq(users.email, "profe@uni.test")))[0]!;
    expect(profe.plan).toBe("paseo");
    const res = await launch("cliente-profe", deepLinkRequest);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "capability", capability: "lti" });
    people["tok-profe"].plan = "u:formacion";
  });
});
