/** Cliente de la API: cookies de sesion + CSRF de doble token. */

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(detail ?? title);
    this.name = "ApiRequestError";
  }
}

/**
 * En la instancia alojada la sesión es de Clerk y viaja como Bearer; el
 * proveedor lo registra el puente de Clerk al arrancar. En el self-host no
 * hay proveedor y mandan las cookies de siempre.
 */
let tokenProvider: (() => Promise<string | null>) | null = null;

export function setAuthTokenProvider(provider: (() => Promise<string | null>) | null): void {
  tokenProvider = provider;
}

/** Cabeceras de autenticación para un fetch a mano (descargas, previsualizaciones). */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = tokenProvider != null ? await tokenProvider().catch(() => null) : null;
  return token != null ? { authorization: `Bearer ${token}` } : {};
}

function csrfToken(): string {
  const m = /(?:^|;\s*)u3c=([^;]+)/.exec(document.cookie);
  return m?.[1] ?? "";
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; raw?: boolean; headers?: Record<string, string> } = {},
): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.body != null) {
    if (opts.body instanceof Blob || opts.body instanceof FormData || typeof opts.body === "string") {
      body = opts.body as BodyInit;
    } else {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
  }
  if (method !== "GET" && method !== "HEAD") {
    headers["x-csrf-token"] = csrfToken();
  }
  const token = tokenProvider != null ? await tokenProvider().catch(() => null) : null;
  if (token != null) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`/api/v1${path}`, { method, headers, body, credentials: "same-origin" });
  if (!res.ok) {
    let problem: { title?: string; detail?: string; [k: string]: unknown } = {};
    try {
      problem = (await res.json()) as typeof problem;
    } catch {
      // sin cuerpo
    }
    throw new ApiRequestError(res.status, problem.title ?? `Error ${res.status}`, problem.detail, problem);
  }
  if (opts.raw === true) return res as unknown as T;
  const text = await res.text();
  return (text === "" ? {} : JSON.parse(text)) as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const token = tokenProvider != null ? await tokenProvider().catch(() => null) : null;
  const res = await fetch(`/api/v1${path}`, { credentials: "same-origin", headers: token != null ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiRequestError(res.status, `Error ${res.status}`);
  return res.blob();
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
