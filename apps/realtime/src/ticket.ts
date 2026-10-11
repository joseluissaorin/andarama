/**
 * Billete de la sala de edición de un recorrido.
 *
 * El navegador no puede poner cabeceras en un WebSocket y la sesión del
 * Studio no siempre es una cookie (en la instancia alojada es un Bearer de
 * Clerk). Por eso la API, que sí sabe quién es quién y qué puede hacer, firma
 * un billete corto con HMAC (`APP_SECRET`) y el Studio lo presenta al abrir
 * `/rt/project/{id}?t=...`. El Worker, el servidor Node y el ejecutable de
 * escritorio lo comprueban sin tocar la base de datos.
 *
 * Formato: base64url(JSON) "." base64url(HMAC-SHA256). Solo WebCrypto, que
 * existe igual en Workers, Node 20+ y Bun.
 */

export interface RealtimeIdentity {
  projectId: string;
  userId: string;
  name: string;
}

interface TicketPayload {
  v: 1;
  p: string;
  u: string;
  n: string;
  /** Caducidad en ms desde la época. */
  e: number;
}

/** Lo que dura un billete: basta para conectar; cada reconexión pide otro. */
export const TICKET_TTL_MS = 2 * 60 * 1000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const pad = text.length % 4 === 0 ? "" : "=".repeat(4 - (text.length % 4));
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(`andarama-rt:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signRealtimeTicket(
  secret: string,
  identity: RealtimeIdentity,
  opts: { ttlMs?: number; now?: number } = {},
): Promise<{ ticket: string; expiresAt: number }> {
  const expiresAt = (opts.now ?? Date.now()) + (opts.ttlMs ?? TICKET_TTL_MS);
  const payload: TicketPayload = {
    v: 1,
    p: identity.projectId,
    u: identity.userId,
    n: identity.name.slice(0, 60),
    e: expiresAt,
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body)));
  return { ticket: `${body}.${toBase64Url(sig)}`, expiresAt };
}

/**
 * Devuelve la identidad si el billete es auténtico, no ha caducado y es de
 * este recorrido; si no, null. La comparación de la firma la hace
 * `crypto.subtle.verify`, en tiempo constante.
 */
export async function verifyRealtimeTicket(
  secret: string,
  ticket: string | null | undefined,
  projectId: string,
  now = Date.now(),
): Promise<RealtimeIdentity | null> {
  if (ticket == null || ticket.length > 2048) return null;
  const dot = ticket.indexOf(".");
  if (dot <= 0) return null;
  const body = ticket.slice(0, dot);
  const sig = fromBase64Url(ticket.slice(dot + 1));
  if (sig == null) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, encoder.encode(body));
  if (!ok) return null;
  const raw = fromBase64Url(body);
  if (raw == null) return null;
  let payload: TicketPayload;
  try {
    payload = JSON.parse(decoder.decode(raw)) as TicketPayload;
  } catch {
    return null;
  }
  if (payload.v !== 1 || typeof payload.u !== "string" || typeof payload.p !== "string") return null;
  if (typeof payload.e !== "number" || payload.e < now) return null;
  if (payload.p !== projectId) return null;
  return { projectId: payload.p, userId: payload.u, name: String(payload.n ?? "") };
}
