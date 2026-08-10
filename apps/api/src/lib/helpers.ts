import { eq } from "drizzle-orm";
import { auditLog, instanceSettings } from "@andarama/db";
import type { Context } from "hono";
import type { AppEnv, Db } from "./context.js";
import { newId, nowMs, parseJson } from "./util.js";
import { tooMany } from "./errors.js";
import type { KVAdapter } from "@andarama/adapters";

// ---------------------------------------------------------------------------
// Ajustes de instancia
// ---------------------------------------------------------------------------

export interface InstanceSettingsData {
  name: string;
  logo?: string;
  defaultLangs: string[];
  /** open | invite | domain */
  registration: "open" | "invite" | "domain";
  allowedDomains: string[];
  maxUploadMb: number;
  trashRetentionDays: number;
  legal: { privacy?: string; cookies?: string; terms?: string };
  defaultQuotaBytes: number;
  defaultQuotaTours: number;
}

export const DEFAULT_SETTINGS: InstanceSettingsData = {
  name: "Andarama",
  defaultLangs: ["es", "en"],
  registration: "open",
  allowedDomains: [],
  maxUploadMb: 512,
  trashRetentionDays: 30,
  legal: {},
  defaultQuotaBytes: 5 * 1024 * 1024 * 1024,
  defaultQuotaTours: 100,
};

export async function getSettings(db: Db): Promise<InstanceSettingsData> {
  const rows = await db.select().from(instanceSettings).where(eq(instanceSettings.key, "instance")).limit(1);
  if (rows[0] == null) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...parseJson<Partial<InstanceSettingsData>>(rows[0].valueJson, {}) };
}

export async function saveSettings(db: Db, data: Partial<InstanceSettingsData>): Promise<void> {
  const current = await getSettings(db);
  const merged = { ...current, ...data };
  const existing = await db.select().from(instanceSettings).where(eq(instanceSettings.key, "instance")).limit(1);
  if (existing[0] != null) {
    await db
      .update(instanceSettings)
      .set({ valueJson: JSON.stringify(merged), updatedAt: nowMs() })
      .where(eq(instanceSettings.key, "instance"));
  } else {
    await db.insert(instanceSettings).values({ key: "instance", valueJson: JSON.stringify(merged), updatedAt: nowMs() });
  }
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

export async function audit(
  c: Context<AppEnv>,
  action: string,
  entity: string,
  entityId: string | null,
  detail?: Record<string, unknown>,
  orgId?: string,
): Promise<void> {
  const db = c.get("db");
  await db.insert(auditLog).values({
    id: newId(),
    orgId: orgId ?? null,
    userId: c.get("auth")?.user.id ?? null,
    action,
    entity,
    entityId,
    detailJson: detail != null ? JSON.stringify(detail) : null,
    at: nowMs(),
  });
}

// ---------------------------------------------------------------------------
// Rate limiting (ventana fija sobre KV)
// ---------------------------------------------------------------------------

export async function rateLimit(
  kv: KVAdapter,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const fullKey = `rl:${key}:${bucket}`;
  const current = parseInt((await kv.get(fullKey)) ?? "0", 10);
  if (current >= limit) throw tooMany();
  await kv.put(fullKey, String(current + 1), { ttlSeconds: windowSeconds * 2 });
}

export function clientIp(c: Context<AppEnv>): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "0.0.0.0"
  );
}

// ---------------------------------------------------------------------------
// Turnstile
// ---------------------------------------------------------------------------

export async function verifyTurnstile(secret: string | undefined, token: string | undefined, ip: string): Promise<boolean> {
  if (secret == null || secret === "") return true; // desactivado
  if (token == null || token === "") return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

// ---------------------------------------------------------------------------
// Sniffing de magic bytes (validacion de tipo real §3.2)
// ---------------------------------------------------------------------------

const SIGNATURES: { mime: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    mime: "image/webp",
    test: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  },
  { mime: "image/gif", test: (b) => ascii(b, 0, 3) === "GIF" },
  { mime: "image/avif", test: (b) => ascii(b, 4, 8) === "ftyp" && (ascii(b, 8, 12) === "avif" || ascii(b, 8, 12) === "avis") },
  { mime: "video/mp4", test: (b) => ascii(b, 4, 8) === "ftyp" },
  { mime: "video/webm", test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { mime: "audio/mpeg", test: (b) => (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) },
  { mime: "audio/wav", test: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE" },
  { mime: "audio/ogg", test: (b) => ascii(b, 0, 4) === "OggS" },
  { mime: "application/pdf", test: (b) => ascii(b, 0, 5) === "%PDF-" },
  { mime: "model/gltf-binary", test: (b) => ascii(b, 0, 4) === "glTF" },
  { mime: "image/svg+xml", test: (b) => {
      const head = new TextDecoder("utf-8", { fatal: false }).decode(b.slice(0, 512)).trimStart();
      return head.startsWith("<?xml") || head.startsWith("<svg") || head.includes("<svg");
    } },
];

function ascii(b: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...b.slice(from, to));
}

/** Detecta el MIME real por magic bytes; null si no es un formato admitido. */
export function sniffMime(head: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    try {
      if (sig.test(head)) return sig.mime;
    } catch {
      // cabecera demasiado corta para esta firma
    }
  }
  return null;
}

const KIND_MIMES: Record<string, string[]> = {
  panorama: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  image: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/svg+xml"],
  floorplan: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
  video: ["video/mp4", "video/webm"],
  audio: ["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "video/mp4"],
  pdf: ["application/pdf"],
  model: ["model/gltf-binary"],
  subtitle: [],
  file: [],
};

export function mimeAllowedForKind(kind: string, sniffed: string | null): boolean {
  const allowed = KIND_MIMES[kind];
  if (allowed == null) return false;
  if (allowed.length === 0) return true; // subtitulos/ficheros: texto, sin firma
  return sniffed != null && allowed.includes(sniffed);
}

/** Saneado de SVG en servidor (elimina scripts/manejadores/foreignObject). */
export function sanitizeSvgServer(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/(href|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2");
}
