import type { Context } from "hono";
import type { AppConfig, AppEnv, Db } from "./context.js";

/**
 * Edición en grupo en directo (§3.5).
 *
 * La API sigue siendo la fuente de la verdad: tras cada escritura correcta
 * se avisa a la sala del recorrido «cambió X (id, versión)» con la fila tal
 * como quedó, y cada Studio abierto la fusiona con lo que tenga a medias.
 */

/** Cabecera con la que el Studio dice desde qué conexión de la sala escribe. */
export const CONN_HEADER = "x-andarama-conn";
const ORIGIN_RE = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Punto de control del producto: ¿puede esta organización editar en grupo en
 * directo? Hoy, sí en todos los planes, igual que el trabajo en equipo
 * (commit 1ea799d). Para dejarlo solo en los planes de pago basta con:
 *
 *   return orgHas(db, config, orgId, "team");
 *
 * (`orgHas` está en ./capabilities.js; en el self-host siempre devuelve sí.)
 * Sin este permiso el Studio funciona como siempre, sin sala ni avisos.
 */
export async function liveCollaborationAllowed(_db: Db, _config: AppConfig, _orgId: string): Promise<boolean> {
  return true;
}

/**
 * Avisa a la sala del recorrido de un cambio ya guardado. Nunca hace fallar
 * la petición: si el aviso no llega, los demás lo verán al reconectar o con
 * el siguiente cambio.
 */
export async function publishChange(c: Context<AppEnv>, projectId: string, event: Record<string, unknown>): Promise<void> {
  const notify = c.get("notifyProject");
  if (notify == null) return;
  const auth = c.get("auth");
  const origin = c.req.header(CONN_HEADER);
  const full: Record<string, unknown> = {
    ...event,
    by: auth?.user.name ?? null,
    byUserId: auth?.user.id ?? null,
    origin: origin != null && ORIGIN_RE.test(origin) ? origin : null,
    at: Date.now(),
  };
  try {
    await notify(projectId, full);
  } catch (err) {
    console.warn("[colab] aviso no entregado", err);
  }
}
