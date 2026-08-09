import type { PasswordHasher } from "../types.js";

/**
 * Hasher PBKDF2-SHA256 sobre WebCrypto (disponible en Workers y Node >= 20).
 * Se usa en Cloudflare Workers, donde Argon2id no es viable (no se permite
 * compilar WASM en runtime y el coste de CPU excede los limites del free
 * tier). En self-host se usa Argon2id (vease node/password.ts); verify
 * soporta ambos formatos PHC.
 */

// Limite de la plataforma: Workers WebCrypto rechaza mas de 100k iteraciones.
const ITERATIONS = 100_000;
const KEYLEN = 32;

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, "");
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function pbkdf2Hash(password: string, iterations = ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derive(password, salt, iterations);
  return `$pbkdf2-sha256$i=${iterations}$${toB64(salt)}$${toB64(derived)}`;
}

export async function pbkdf2Verify(password: string, phc: string): Promise<boolean> {
  const m = /^\$pbkdf2-sha256\$i=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(phc);
  if (m == null) return false;
  const iterations = parseInt(m[1]!, 10);
  const salt = fromB64(m[2]!);
  const expected = fromB64(m[3]!);
  const derived = await derive(password, salt, iterations);
  return timingSafeEqual(derived, expected);
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    keyMaterial,
    KEYLEN * 8,
  );
  return new Uint8Array(bits);
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export const pbkdf2Hasher: PasswordHasher = {
  hash: (password) => pbkdf2Hash(password),
  verify: (password, phc) => pbkdf2Verify(password, phc),
};
