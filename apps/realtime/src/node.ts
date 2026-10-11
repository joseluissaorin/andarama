import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { LiveTourRoom, ProjectPresenceRoom } from "./rooms.js";
import { verifyRealtimeTicket, type RealtimeIdentity } from "./ticket.js";

/**
 * Servidor de tiempo real self-host: mismas salas que los Durable Objects,
 * sobre `ws` en el propio proceso Node (§5.7: un proceso, un puerto).
 */

export interface RealtimeNodeServer {
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
  createLiveRoom(): { code: string; guideKey: string };
  getLiveGuideKey(code: string): string | null;
  /** Difunde un cambio guardado a la sala de edición del recorrido. */
  notifyProject(projectId: string, event: Record<string, unknown>): Promise<void>;
  /** Para el latido de los sockets (pruebas y apagado ordenado). */
  close(): void;
}

/** Cada cuánto se comprueba que los sockets siguen vivos. */
const HEARTBEAT_MS = 30_000;

export async function createRealtimeServer(opts: {
  /**
   * Secreto de instancia con el que la API firma los billetes de la sala de
   * edición (`POST /api/v1/projects/{id}/realtime`).
   */
  secret: string;
}): Promise<RealtimeNodeServer> {
  const { WebSocketServer } = await import("ws");
  const wss = new WebSocketServer({ noServer: true });

  const liveRooms = new Map<string, { room: LiveTourRoom; guideKey: string }>();
  const presenceRooms = new Map<string, ProjectPresenceRoom>();
  let counter = 0;

  // Latido: un socket que no contesta al ping del protocolo en un ciclo se
  // da por muerto (portátil cerrado, red caída sin FIN) y sale de la sala.
  const alive = new WeakMap<object, boolean>();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      try {
        ws.ping();
      } catch {
        // se limpiará al cerrarse
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  const randomCode = (): string => {
    const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
    let out = "";
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
  };

  const reject = (socket: Duplex, status: number, text: string): void => {
    try {
      socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    } finally {
      socket.destroy();
    }
  };

  const joinProject = (projectId: string, identity: RealtimeIdentity, ws: import("ws").WebSocket): void => {
    let room = presenceRooms.get(projectId);
    if (room == null) {
      room = new ProjectPresenceRoom();
      presenceRooms.set(projectId, room);
    }
    const id = `c${++counter}`;
    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));
    room.join(id, ws as never, { userId: identity.userId, name: identity.name });
    ws.on("message", (data) => {
      alive.set(ws, true);
      room!.message(id, String(data));
    });
    ws.on("close", () => {
      room!.leave(id);
      if (room!.size === 0 && presenceRooms.get(projectId) === room) presenceRooms.delete(projectId);
    });
  };

  return {
    createLiveRoom() {
      const code = randomCode();
      const guideKey = crypto.randomUUID();
      liveRooms.set(code, { room: new LiveTourRoom(guideKey), guideKey });
      return { code, guideKey };
    },

    getLiveGuideKey(code) {
      return liveRooms.get(code)?.guideKey ?? null;
    },

    async notifyProject(projectId, event) {
      presenceRooms.get(projectId)?.publish(event);
    },

    close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
    },

    handleUpgrade(req, socket, head) {
      const url = new URL(req.url ?? "/", "http://localhost");
      const liveMatch = /^\/rt\/live\/([A-Za-z0-9-]+)$/.exec(url.pathname);
      const projectMatch = /^\/rt\/project\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
      if (liveMatch == null && projectMatch == null) return false;

      if (projectMatch != null) {
        // Sala de edición: el billete se comprueba antes de aceptar el socket
        const projectId = projectMatch[1]!;
        void verifyRealtimeTicket(opts.secret, url.searchParams.get("t"), projectId)
          .catch(() => null)
          .then((identity) => {
            if (identity == null) {
              reject(socket, 401, "Unauthorized");
              return;
            }
            wss.handleUpgrade(req, socket, head, (ws) => joinProject(projectId, identity, ws));
          });
        return true;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        const id = `c${++counter}`;
        let joined = false;
        alive.set(ws, true);
        ws.on("pong", () => alive.set(ws, true));
        const code = liveMatch![1]!;
        let entry = liveRooms.get(code);
        if (entry == null) {
          // Sala no creada por la API: se instancia con clave nueva; quien
          // tenga la clave (creador via API) sera guia, el resto asistentes.
          entry = { room: new LiveTourRoom(crypto.randomUUID()), guideKey: crypto.randomUUID() };
          liveRooms.set(code, entry);
        }
        const { room } = entry;
        ws.on("message", (data) => {
          const raw = String(data);
          if (!joined) {
            try {
              const hello = JSON.parse(raw) as { type?: string; role?: string; name?: string; key?: string };
              if (hello.type === "hello") {
                joined = true;
                room.join(id, ws as never, { role: hello.role ?? "attendee", name: hello.name, key: hello.key });
                return;
              }
            } catch {
              // invalido
            }
            ws.close(1002, "Se esperaba hello");
            return;
          }
          room.message(id, raw);
        });
        ws.on("close", () => {
          if (joined) room.leave(id);
        });
      });
      return true;
    },
  };
}

export { LiveTourRoom, ProjectPresenceRoom, type SocketLike } from "./rooms.js";
export { signRealtimeTicket, verifyRealtimeTicket, type RealtimeIdentity } from "./ticket.js";
