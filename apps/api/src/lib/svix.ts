/**
 * Verificación de webhooks firmados con el esquema de Svix, que es el que
 * usa Clerk. Se implementa con WebCrypto (funciona igual en Workers y en
 * Node) y sin la dependencia `svix`:
 *
 *   contenido firmado = `${svix-id}.${svix-timestamp}.${cuerpo}`
 *   firma             = base64(HMAC-SHA256(clave, contenido))
 *   clave             = base64 decodificado de lo que sigue a `whsec_`
 *
 * La cabecera `svix-signature` trae una o varias firmas separadas por
 * espacios (`v1,<base64>`) durante la rotación del secreto: basta con que
 * coincida una. Se rechazan los mensajes con más de cinco minutos de desfase
 * para que una petición capturada no se pueda repetir.
 */

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  id: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function secretBytes(secret: string): Uint8Array<ArrayBuffer> {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  return base64ToBytes(raw);
}

/** Firma `v1,<base64>` de un mensaje; la usan también las pruebas para simular a Clerk. */
export async function svixSign(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secretBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return `v1,${bytesToBase64(new Uint8Array(sig))}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** true si el mensaje lo firmó quien tiene el secreto y no es antiguo. */
export async function svixVerify(secret: string, headers: SvixHeaders, body: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (id == null || id === "" || timestamp == null || signature == null || signature === "") return false;
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > SVIX_TOLERANCE_SECONDS) return false;
  let expected: string;
  try {
    expected = (await svixSign(secret, id, timestamp, body)).slice("v1,".length);
  } catch {
    return false; // secreto mal formado
  }
  return signature
    .split(" ")
    .map((part) => part.trim())
    .some((part) => part.startsWith("v1,") && timingSafeEqual(part.slice(3), expected));
}
