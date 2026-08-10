import type { Context } from "hono";

/** Errores RFC 9457 (application/problem+json). */

export class ApiError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail?: string,
    public type = "about:blank",
    public extra?: Record<string, unknown>,
  ) {
    super(detail ?? title);
    this.name = "ApiError";
  }
}

export function problem(c: Context, err: ApiError): Response {
  return c.json(
    {
      type: err.type,
      title: err.title,
      status: err.status,
      detail: err.detail,
      instance: c.req.path,
      ...err.extra,
    },
    err.status as 400,
    { "content-type": "application/problem+json" },
  );
}

export const badRequest = (detail?: string, extra?: Record<string, unknown>): ApiError =>
  new ApiError(400, "Petición inválida", detail, "https://andarama.com/errors/bad-request", extra);
export const unauthorized = (detail = "Autenticación requerida"): ApiError =>
  new ApiError(401, "No autenticado", detail, "https://andarama.com/errors/unauthorized");
export const forbidden = (detail = "No tienes permiso para esta operación"): ApiError =>
  new ApiError(403, "Prohibido", detail, "https://andarama.com/errors/forbidden");
export const notFound = (detail = "Recurso no encontrado"): ApiError =>
  new ApiError(404, "No encontrado", detail, "https://andarama.com/errors/not-found");
export const conflict = (detail?: string): ApiError =>
  new ApiError(409, "Conflicto", detail, "https://andarama.com/errors/conflict");
export const tooMany = (detail = "Demasiadas peticiones; inténtalo mas tarde"): ApiError =>
  new ApiError(429, "Límite de peticiones", detail, "https://andarama.com/errors/rate-limit");
export const payloadTooLarge = (detail?: string): ApiError =>
  new ApiError(413, "Contenido demasiado grande", detail, "https://andarama.com/errors/too-large");
export const serverError = (detail = "Error interno"): ApiError =>
  new ApiError(500, "Error interno", detail, "https://andarama.com/errors/internal");
