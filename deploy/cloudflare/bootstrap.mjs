#!/usr/bin/env node
/**
 * Bootstrap del despliegue Cloudflare (§5.7): de cero a instancia
 * funcionando con una cuenta gratuita en menos de 10 minutos.
 *
 *   pnpm install
 *   pnpm deploy:cloudflare
 *
 * Crea (si no existen): base D1 + migraciones, bucket R2, namespace KV,
 * dataset de Analytics Engine (implicito), secretos, y despliega el Worker
 * con los assets del Studio y del visor. Idempotente: re-ejecutar = actualizar.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const configPath = join(here, "wrangler.jsonc");

const wrangler = (args, opts = {}) => {
  // Con input hay que canalizar stdin (stdio "inherit" lo ignoraria)
  const stdin = opts.input != null ? "pipe" : "inherit";
  const res = spawnSync("npx", ["wrangler", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: opts.capture ? [stdin, "pipe", "pipe"] : [stdin, "inherit", "inherit"],
    input: opts.input,
    env: process.env,
  });
  if (res.status !== 0 && !opts.allowFail) {
    if (opts.capture) console.error(res.stdout, res.stderr);
    throw new Error(`wrangler ${args.join(" ")} fallo (${res.status})`);
  }
  return (res.stdout ?? "") + (res.stderr ?? "");
};

const log = (msg) => console.log(`\n== ${msg}`);

log("Comprobando autenticación de Cloudflare");
const who = wrangler(["whoami"], { capture: true, allowFail: true });
if (who.includes("not authenticated") || who.includes("You are logged in") === false && !who.includes("Account")) {
  console.log("Inicia sesión en Cloudflare:");
  wrangler(["login"]);
}

let config = readFileSync(configPath, "utf8");

// ---------------------------------------------------------------------------
log("Base de datos D1");
if (config.includes("REPLACE_D1_ID")) {
  const out = wrangler(["d1", "create", "ull360"], { capture: true, allowFail: true });
  let id = /"database_id":\s*"([a-f0-9-]{36})"/.exec(out)?.[1] ?? /database_id\s*=\s*"([a-f0-9-]{36})"/.exec(out)?.[1];
  if (id == null) {
    // Ya existia: recuperar el id del listado
    const list = wrangler(["d1", "list", "--json"], { capture: true });
    const entries = JSON.parse(list.slice(list.indexOf("[")));
    id = entries.find((d) => d.name === "ull360")?.uuid;
  }
  if (id == null) throw new Error("No se pudo obtener el ID de la base D1");
  config = config.replace("REPLACE_D1_ID", id);
  writeFileSync(configPath, config);
  console.log(`D1 ull360: ${id}`);
} else {
  console.log("D1 ya configurada");
}

log("Migraciones D1");
wrangler(["d1", "migrations", "apply", "ull360", "--remote", "-c", configPath]);

// ---------------------------------------------------------------------------
log("Bucket R2");
const buckets = wrangler(["r2", "bucket", "list"], { capture: true, allowFail: true });
if (!buckets.includes("ull360")) {
  wrangler(["r2", "bucket", "create", "ull360"]);
} else {
  console.log("Bucket ull360 ya existe");
}

// ---------------------------------------------------------------------------
log("Namespace KV");
if (config.includes("REPLACE_KV_ID")) {
  const out = wrangler(["kv", "namespace", "create", "KV"], { capture: true, allowFail: true });
  let id = /id\s*[:=]\s*"([a-f0-9]{32})"/.exec(out)?.[1];
  if (id == null) {
    const list = wrangler(["kv", "namespace", "list"], { capture: true });
    const entries = JSON.parse(list.slice(list.indexOf("[")));
    id = entries.find((n) => n.title.includes("KV"))?.id;
  }
  if (id == null) throw new Error("No se pudo obtener el ID del namespace KV");
  config = config.replace("REPLACE_KV_ID", id);
  writeFileSync(configPath, config);
  console.log(`KV: ${id}`);
} else {
  console.log("KV ya configurado");
}

// ---------------------------------------------------------------------------
log("Secretos");
const secretsOut = wrangler(["secret", "list", "-c", configPath], { capture: true, allowFail: true });
if (!secretsOut.includes("APP_SECRET")) {
  const secret = randomBytes(32).toString("hex");
  wrangler(["secret", "put", "APP_SECRET", "-c", configPath], { input: secret });
  console.log("APP_SECRET generado y almacenado");
} else {
  console.log("APP_SECRET ya definido");
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const optionalSecrets = [
  ["EMAIL_WEBHOOK_URL", "URL del webhook de email (Resend u otro; vacío = modo log)"],
  ["TURNSTILE_SITE_KEY", "Clave de sitio Turnstile (vacío = sin anti-spam)"],
  ["TURNSTILE_SECRET", "Clave secreta Turnstile"],
  ["OIDC_ISSUER", "Issuer OIDC del SSO institucional (vacío = sin SSO)"],
];
if (process.stdin.isTTY) {
  for (const [name, prompt] of optionalSecrets) {
    if (secretsOut.includes(name)) continue;
    const value = (await rl.question(`${prompt}: `)).trim();
    if (value !== "") wrangler(["secret", "put", name, "-c", configPath], { input: value });
  }
}
rl.close();

// ---------------------------------------------------------------------------
log("Compilando paquetes y Studio");
execFileSync("pnpm", ["build:packages"], { cwd: root, stdio: "inherit" });
execFileSync("pnpm", ["--filter", "@ull360/studio", "build"], { cwd: root, stdio: "inherit" });

log("Desplegando Worker");
wrangler(["deploy", "-c", configPath]);

log("Listo");
console.log(`
Instancia desplegada. Siguientes pasos:
 1. Abre la URL workers.dev mostrada arriba y registra el primer usuario
    (será administrador de la instancia).
 2. Fija PUBLIC_URL en deploy/cloudflare/wrangler.jsonc (vars) con esa URL
    y vuelve a ejecutar pnpm deploy:cloudflare.
 3. Opcional: dominio propio (routes), Turnstile, SSO OIDC, email.
Documentación completa: apps/docs (guia de despliegue Cloudflare).`);
