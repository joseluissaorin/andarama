import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { requireAuth } from "../lib/session.js";
import { serverError } from "../lib/errors.js";

/**
 * Salas de visita guiada en vivo (§2.15): codigos efimeros. La creacion la
 * hace un usuario autenticado; los asistentes se conectan por WebSocket a
 * /rt/live/{code} sin cuenta.
 */
export function liveRoutes(createLiveRoom: (() => Promise<{ code: string; guideKey: string }>) | null): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post("/rooms", async (c) => {
    requireAuth(c);
    if (createLiveRoom == null) throw serverError("Tiempo real no disponible en esta instancia");
    const room = await createLiveRoom();
    const base = c.get("config").publicUrl.replace(/^http/, "ws");
    return c.json(
      {
        code: room.code,
        guideKey: room.guideKey,
        wsUrl: `${base}/rt/live/${room.code}`,
        attendeeHint: `?live=${room.code}`,
        guideHint: `?live=${room.code}&guide=${room.guideKey}`,
      },
      201,
    );
  });

  return r;
}
