import { Hono } from "hono";
import { signRealtimeTicket } from "@andarama/realtime";
import type { AppEnv } from "../lib/context.js";
import { ApiError, forbidden } from "../lib/errors.js";
import { requireAuth, requireScope } from "../lib/session.js";
import { projectAccess } from "../lib/authz.js";
import { requireActivePlan } from "../lib/capabilities.js";
import { liveCollaborationAllowed } from "../lib/collab.js";

/**
 * Billete para entrar en la sala de edición de un recorrido
 * (`/rt/project/{id}?t=...`). Solo lo da a quien puede editarlo: miembros
 * del equipo con rol de colaborador o más, o personas con el recorrido
 * compartido para editar. Caduca en dos minutos; cada reconexión pide otro,
 * así que quitarle a alguien el acceso le cierra la puerta en la siguiente.
 */
export function collabRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post("/:projectId/realtime", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:write");
    const db = c.get("db");
    const config = c.get("config");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canEdit) throw forbidden("Solo quien puede editar el recorrido entra en la edición en grupo");
    await requireActivePlan(db, config, access.project.orgId);
    if (c.get("notifyProject") == null) {
      throw new ApiError(503, "Sin tiempo real", "Esta instancia no tiene sala de edición en directo", "https://andarama.com/errors/realtime", {
        code: "realtime_unavailable",
      });
    }
    if (!(await liveCollaborationAllowed(db, config, access.project.orgId))) {
      throw new ApiError(403, "No incluido en el plan", "La edición en grupo en directo no está incluida en este plan", "https://andarama.com/errors/capability", {
        code: "collab_disabled",
      });
    }
    const name = auth.user.name.trim() !== "" ? auth.user.name : auth.user.email.split("@")[0] ?? "";
    const { ticket, expiresAt } = await signRealtimeTicket(config.secret, {
      projectId: access.project.id,
      userId: auth.user.id,
      name,
    });
    return c.json({ ticket, expiresAt, path: `/rt/project/${access.project.id}?t=${encodeURIComponent(ticket)}` });
  });

  return r;
}
