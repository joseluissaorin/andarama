import { hmacSign, hmacVerify } from "@andarama/adapters";

/**
 * Vale de descarga del export ZIP. El Studio pide miles de teselas y, por la
 * ruta de la vista previa, cada una pasaba por Clerk, D1, projectAccess y KV:
 * lento, y un fallo pasajero tumbaba el paquete entero. POST /export firma
 * una vez el permiso (proyecto + prefijos de almacenamiento del tour, con
 * caducidad) y cada fichero se sirve comprobando solo la firma.
 *
 * Formato: base64url(JSON {p, e, s}) + "." + HMAC-SHA256 en hexadecimal.
 */

/** Vida del mapa de la vista previa en KV y del vale de descarga: 6 h. */
export const PREVIEW_MAP_TTL_SECONDS = 6 * 3600;
export const EXPORT_TOKEN_TTL_SECONDS = 6 * 3600;

/**
 * Por encima de este tamaño el vale se acorta a prefijos por organización:
 * va en la URL de cada petición y Cloudflare corta las URL de más de 16 KB.
 */
const MAX_SCOPE_CHARS = 6000;

interface ExportTokenPayload {
  /** Proyecto. */
  p: string;
  /** Caducidad, en segundos desde epoch. */
  e: number;
  /** Prefijos de almacenamiento permitidos. */
  s: string[];
}

function dirOf(key: string): string {
  const i = key.lastIndexOf("/");
  return i >= 0 ? key.slice(0, i + 1) : key;
}

/**
 * Prefijos de almacenamiento que cubren todos los assets del tour: la carpeta
 * de cada clave directa y cada prefijo de teselas, sin los ya cubiertos por
 * otro más corto. Si la lista no cabe en una URL, se cae a `media/<org>/`.
 */
export function exportScope(map: {
  assets: Record<string, string>;
  prefixes: Record<string, string>;
}): string[] {
  const candidates = [...Object.values(map.assets).map(dirOf), ...Object.values(map.prefixes)]
    .filter((p) => p !== "" && !p.includes(".."))
    .sort((a, b) => a.length - b.length);
  const scope: string[] = [];
  for (const p of candidates) {
    if (!scope.some((s) => p.startsWith(s))) scope.push(p);
  }
  if (scope.join("").length <= MAX_SCOPE_CHARS) return scope;
  const coarse = new Set(scope.map((p) => p.split("/").slice(0, 2).join("/") + "/"));
  return [...coarse];
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64: string): string {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

export async function signExportToken(
  secret: string,
  projectId: string,
  scope: string[],
  ttlSeconds = EXPORT_TOKEN_TTL_SECONDS,
): Promise<string> {
  const payload: ExportTokenPayload = {
    p: projectId,
    e: Math.floor(Date.now() / 1000) + ttlSeconds,
    s: scope,
  };
  const body = toBase64Url(JSON.stringify(payload));
  return `${body}.${await hmacSign(secret, `export-blob.${body}`)}`;
}

/**
 * ¿Autoriza el vale a leer `key` del proyecto? Falso si la firma no cuadra,
 * si caducó, si es de otro proyecto o si la clave queda fuera de sus prefijos.
 */
export async function verifyExportToken(
  secret: string,
  token: string,
  projectId: string,
  key: string,
): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const body = token.slice(0, dot);
  if (!(await hmacVerify(secret, `export-blob.${body}`, token.slice(dot + 1)))) return false;
  let payload: ExportTokenPayload;
  try {
    payload = JSON.parse(fromBase64Url(body)) as ExportTokenPayload;
  } catch {
    return false;
  }
  if (payload.p !== projectId) return false;
  if (!Number.isFinite(payload.e) || payload.e < Math.floor(Date.now() / 1000)) return false;
  if (key === "" || key.includes("..")) return false;
  return Array.isArray(payload.s) && payload.s.some((prefix) => key.startsWith(prefix));
}
