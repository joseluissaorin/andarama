/**
 * Firmas HMAC-SHA256 para URLs de subida pass-through (cuando no hay
 * credenciales S3 para prefirmar contra R2/MinIO directamente) y para
 * enlaces temporales. WebCrypto: funciona en Workers y Node.
 */

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacVerify(secret: string, payload: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(secret, payload);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/** Construye una URL de subida firmada servida por la propia API. */
export async function signUploadUrl(
  secret: string,
  publicUrl: string,
  key: string,
  opts: { expiresInSeconds?: number; part?: number; uploadId?: string } = {},
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? 3600);
  const params = new URLSearchParams({ key, exp: String(exp) });
  if (opts.part != null) params.set("part", String(opts.part));
  if (opts.uploadId != null) params.set("uploadId", opts.uploadId);
  const sig = await hmacSign(secret, params.toString());
  params.set("sig", sig);
  return `${publicUrl}/api/v1/uploads/direct?${params.toString()}`;
}

export async function verifyUploadUrl(
  secret: string,
  searchParams: URLSearchParams,
): Promise<{ key: string; part?: number; uploadId?: string } | null> {
  const sig = searchParams.get("sig");
  if (sig == null) return null;
  const params = new URLSearchParams(searchParams);
  params.delete("sig");
  // Reconstruir en orden canonico de insercion original: key, exp, part?, uploadId?
  const canonical = new URLSearchParams();
  const key = params.get("key");
  const exp = params.get("exp");
  if (key == null || exp == null) return null;
  canonical.set("key", key);
  canonical.set("exp", exp);
  const part = params.get("part");
  if (part != null) canonical.set("part", part);
  const uploadId = params.get("uploadId");
  if (uploadId != null) canonical.set("uploadId", uploadId);
  if (parseInt(exp, 10) < Math.floor(Date.now() / 1000)) return null;
  const ok = await hmacVerify(secret, canonical.toString(), sig);
  if (!ok) return null;
  return {
    key,
    part: part != null ? parseInt(part, 10) : undefined,
    uploadId: uploadId ?? undefined,
  };
}
