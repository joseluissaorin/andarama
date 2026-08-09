/** Utilidades comunes de la API. */

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** ID no adivinable estilo nanoid (128 bits de entropia). */
export function newId(size = 21): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let id = "";
  for (let i = 0; i < size; i++) {
    id += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return id;
}

/** Token secreto (para sesiones, verificaciones, API tokens). */
export function newToken(bytes = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const hash = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "sin-titulo"
  );
}

export function nowMs(): number {
  return Date.now();
}

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (text == null || text === "") return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Hash de IP anonimizado con sal diaria (RGPD: no se almacena la IP). */
export async function dailyIpHash(ip: string, secret: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  return (await sha256Hex(`${secret}:${day}:${ip}`)).slice(0, 24);
}
