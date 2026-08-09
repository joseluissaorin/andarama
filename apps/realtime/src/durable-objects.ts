import { LiveTourRoom, ProjectPresenceRoom } from "./rooms.js";

/**
 * Durable Objects de Cloudflare. Tipos estructurales minimos para no
 * depender de @cloudflare/workers-types en el resto del monorepo.
 */

interface DurableObjectStateLike {
  acceptWebSocket?(ws: unknown): void;
  storage: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void> };
}

declare const WebSocketPair: new () => { 0: any; 1: any };

let connCounter = 0;

/** Sala de visita guiada en vivo (una instancia por codigo de sala). */
export class LiveTourRoomDO {
  private room: LiveTourRoom | null = null;
  private guideKey: string | null = null;

  constructor(private state: DurableObjectStateLike) {}

  private async ensureRoom(): Promise<LiveTourRoom> {
    if (this.room == null) {
      if (this.guideKey == null) {
        this.guideKey = (await this.state.storage.get<string>("guideKey")) ?? null;
        if (this.guideKey == null) {
          this.guideKey = crypto.randomUUID();
          await this.state.storage.put("guideKey", this.guideKey);
        }
      }
      this.room = new LiveTourRoom(this.guideKey);
    }
    return this.room;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Endpoint interno para conocer/crear la clave de guia
    if (url.pathname.endsWith("/guide-key")) {
      await this.ensureRoom();
      return new Response(JSON.stringify({ guideKey: this.guideKey }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Se esperaba WebSocket", { status: 426 });
    }
    const room = await this.ensureRoom();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const id = `c${++connCounter}`;
    let joined = false;
    server.addEventListener("message", (e: MessageEvent) => {
      const raw = String(e.data);
      if (!joined) {
        try {
          const hello = JSON.parse(raw) as { type?: string; role?: string; name?: string; key?: string };
          if (hello.type === "hello") {
            joined = true;
            room.join(id, server, { role: hello.role ?? "attendee", name: hello.name, key: hello.key });
            return;
          }
        } catch {
          // primer mensaje invalido
        }
        server.close(1002, "Se esperaba hello");
        return;
      }
      room.message(id, raw);
    });
    server.addEventListener("close", () => {
      if (joined) room.leave(id);
    });
    server.addEventListener("error", () => {
      if (joined) room.leave(id);
    });
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: unknown });
  }
}

/** Presencia y bloqueos blandos por proyecto (una instancia por proyecto). */
export class ProjectPresenceDO {
  private room = new ProjectPresenceRoom();

  constructor(_state: DurableObjectStateLike) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Se esperaba WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const id = `c${++connCounter}`;
    let joined = false;
    server.addEventListener("message", (e: MessageEvent) => {
      const raw = String(e.data);
      if (!joined) {
        try {
          const hello = JSON.parse(raw) as { type?: string; userId?: string; name?: string };
          if (hello.type === "hello") {
            joined = true;
            this.room.join(id, server, { userId: hello.userId, name: hello.name });
            return;
          }
        } catch {
          // invalido
        }
        server.close(1002, "Se esperaba hello");
        return;
      }
      this.room.message(id, raw);
    });
    server.addEventListener("close", () => {
      if (joined) this.room.leave(id);
    });
    server.addEventListener("error", () => {
      if (joined) this.room.leave(id);
    });
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: unknown });
  }
}
