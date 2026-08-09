import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { LiveTourRoom, ProjectPresenceRoom } from "./rooms.js";

/**
 * Servidor de tiempo real self-host: mismas salas que los Durable Objects,
 * sobre `ws` en el propio proceso Node (§5.7: un proceso, un puerto).
 */

export interface RealtimeNodeServer {
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
  createLiveRoom(): { code: string; guideKey: string };
  getLiveGuideKey(code: string): string | null;
}

export async function createRealtimeServer(opts: {
  /** Autoriza el acceso de presencia a un proyecto (sesion del Studio). */
  authorizePresence?: (req: IncomingMessage, projectId: string) => Promise<boolean>;
}): Promise<RealtimeNodeServer> {
  const { WebSocketServer } = await import("ws");
  const wss = new WebSocketServer({ noServer: true });

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

    handleUpgrade(req, socket, head) {
      const url = new URL(req.url ?? "/", "http://localhost");
      const liveMatch = /^\/rt\/live\/([A-Za-z0-9-]+)$/.exec(url.pathname);
      const projectMatch = /^\/rt\/project\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
      if (liveMatch == null && projectMatch == null) return false;

      wss.handleUpgrade(req, socket, head, (ws) => {
        const id = `c${++counter}`;
        let joined = false;
        if (liveMatch != null) {
          const code = liveMatch[1]!;
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
        } else if (projectMatch != null) {
          const projectId = projectMatch[1]!;
          void (async () => {
            if (opts.authorizePresence != null) {
              const ok = await opts.authorizePresence(req, projectId).catch(() => false);
              if (!ok) {
                ws.close(4403, "No autorizado");
                return;
              }
            }
            let room = presenceRooms.get(projectId);
            if (room == null) {
              room = new ProjectPresenceRoom();
              presenceRooms.set(projectId, room);
            }
            ws.on("message", (data) => {
              const raw = String(data);
              if (!joined) {
                try {
                  const hello = JSON.parse(raw) as { type?: string; userId?: string; name?: string };
                  if (hello.type === "hello") {
                    joined = true;
                    room!.join(id, ws as never, hello);
                    return;
                  }
                } catch {
                  // invalido
                }
                ws.close(1002, "Se esperaba hello");
                return;
              }
              room!.message(id, raw);
            });
            ws.on("close", () => {
              if (joined) room!.leave(id);
            });
          })();
        }
      });
      return true;
    },
  };
}

