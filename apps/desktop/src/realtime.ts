import type { Server, ServerWebSocket } from "bun";
import { LiveTourRoom, ProjectPresenceRoom, verifyRealtimeTicket, type RealtimeIdentity } from "@andarama/realtime";

/**
 * Tiempo real del ejecutable de escritorio: las mismas salas que los Durable
 * Objects y que el servidor Node, pero sobre los WebSockets nativos de Bun,
 * que no pasan por `ws` ni por el evento `upgrade` de node:http.
 */

interface SocketData {
  kind: "live" | "project";
  key: string;
  id: string;
  joined: boolean;
  /** Sala de edición: quién es, según el billete que firmó la API. */
  identity?: RealtimeIdentity;
}

export interface DesktopRealtime {
  /**
   * Intenta convertir la petición en WebSocket: true si lo hizo, false si no
   * es una ruta de tiempo real y una respuesta si hay que rechazarla.
   */
  upgrade(req: Request, server: Server<SocketData>): Promise<boolean | Response>;
  websocket: {
    open(ws: ServerWebSocket<SocketData>): void;
    message(ws: ServerWebSocket<SocketData>, data: string | Buffer): void;
    close(ws: ServerWebSocket<SocketData>): void;
  };
  createLiveRoom(): { code: string; guideKey: string };
  /** Difunde un cambio guardado a la sala de edición del recorrido. */
  notifyProject(projectId: string, event: Record<string, unknown>): Promise<void>;
}

/** `secret`: el de la instancia, con el que la API firma los billetes de la sala de edición. */
export function createDesktopRealtime(secret: string): DesktopRealtime {
  const liveRooms = new Map<string, { room: LiveTourRoom; guideKey: string }>();
  const presenceRooms = new Map<string, ProjectPresenceRoom>();
  let counter = 0;

  const randomCode = (): string => {
    const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
    let out = "";
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
  };

  const liveRoom = (code: string): LiveTourRoom => {
    let entry = liveRooms.get(code);
    if (entry == null) {
      // Sala no creada por la API: se instancia con clave nueva; quien tenga
      // la clave (creador vía API) será guía, el resto asistentes
      entry = { room: new LiveTourRoom(crypto.randomUUID()), guideKey: crypto.randomUUID() };
      liveRooms.set(code, entry);
    }
    return entry.room;
  };

  const presenceRoom = (projectId: string): ProjectPresenceRoom => {
    let room = presenceRooms.get(projectId);
    if (room == null) {
      room = new ProjectPresenceRoom();
      presenceRooms.set(projectId, room);
    }
    return room;
  };

  return {
    createLiveRoom() {
      const code = randomCode();
      const guideKey = crypto.randomUUID();
      liveRooms.set(code, { room: new LiveTourRoom(guideKey), guideKey });
      return { code, guideKey };
    },

    async notifyProject(projectId, event) {
      presenceRooms.get(projectId)?.publish(event);
    },

    async upgrade(req, server) {
      const url = new URL(req.url);
      const live = /^\/rt\/live\/([A-Za-z0-9-]+)$/.exec(url.pathname);
      const project = /^\/rt\/project\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
      if (live == null && project == null) return false;
      const data: SocketData = {
        kind: live != null ? "live" : "project",
        key: (live ?? project)![1]!,
        id: `c${++counter}`,
        joined: false,
      };
      if (project != null) {
        const identity = await verifyRealtimeTicket(secret, url.searchParams.get("t"), data.key).catch(() => null);
        if (identity == null) return new Response("No autorizado", { status: 401 });
        data.identity = identity;
      }
      return server.upgrade(req, { data });
    },

    websocket: {
      open(ws) {
        // La visita en vivo se une al recibir el saludo; la sala de edición,
        // en el acto, con la identidad del billete
        const { data } = ws;
        if (data.kind !== "project" || data.identity == null) return;
        data.joined = true;
        presenceRoom(data.key).join(data.id, ws as never, { userId: data.identity.userId, name: data.identity.name });
      },
      message(ws, raw) {
        const text = String(raw);
        const { data } = ws;
        if (data.kind === "live") {
          const room = liveRoom(data.key);
          if (!data.joined) {
            try {
              const hello = JSON.parse(text) as { type?: string; role?: string; name?: string; key?: string };
              if (hello.type === "hello") {
                data.joined = true;
                room.join(data.id, ws as never, { role: hello.role ?? "attendee", name: hello.name, key: hello.key });
                return;
              }
            } catch {
              // inválido
            }
            ws.close(1002, "Se esperaba hello");
            return;
          }
          room.message(data.id, text);
          return;
        }
        if (!data.joined) return;
        presenceRoom(data.key).message(data.id, text);
      },
      close(ws) {
        const { data } = ws;
        if (!data.joined) return;
        if (data.kind === "live") {
          liveRooms.get(data.key)?.room.leave(data.id);
          return;
        }
        const room = presenceRooms.get(data.key);
        room?.leave(data.id);
        if (room != null && room.size === 0) presenceRooms.delete(data.key);
      },
    },
  };
}
