import { LiveTourRoom, ProjectPresenceRoom, type PresenceMemberState } from "./rooms.js";

/**
 * Durable Objects de Cloudflare. Tipos estructurales minimos para no
 * depender de @cloudflare/workers-types en el resto del monorepo.
 */

interface HibernatableSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment?(value: unknown): void;
  deserializeAttachment?(): unknown;
}

interface DurableObjectStateLike {
  acceptWebSocket?(ws: unknown, tags?: string[]): void;
  getWebSockets?(tag?: string): HibernatableSocket[];
  setWebSocketAutoResponse?(pair: unknown): void;
  storage: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void> };
}

declare const WebSocketPair: new () => { 0: any; 1: any };
declare const WebSocketRequestResponsePair: (new (request: string, response: string) => unknown) | undefined;

/** Cabeceras con las que el Worker presenta a quien ya autenticó. */
export const RT_USER_ID_HEADER = "x-andarama-rt-user";
export const RT_USER_NAME_HEADER = "x-andarama-rt-name";

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

interface PresenceAttachment {
  id: string;
  state: PresenceMemberState;
}

/**
 * Sala de edición de un recorrido (una instancia por proyecto).
 *
 * Usa la API de hibernación de WebSockets: con todos quietos, el objeto se
 * duerme y no cobra tiempo de pared. El estado de cada conexión vive en el
 * adjunto del socket, así que al despertar la sala se reconstruye entera; el
 * «ping» de los clientes lo contesta el propio runtime sin despertarlo.
 *
 * Solo recibe peticiones que monta el Worker: el WebSocket, con la identidad
 * ya comprobada en cabeceras, y el aviso interno `/notify` tras cada
 * escritura de la API.
 */
export class ProjectPresenceDO {
  private room: ProjectPresenceRoom | null = null;

  constructor(private state: DurableObjectStateLike) {
    if (typeof WebSocketRequestResponsePair !== "undefined" && this.state.setWebSocketAutoResponse != null) {
      this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    }
  }

  private get hibernates(): boolean {
    return this.state.acceptWebSocket != null && this.state.getWebSockets != null;
  }

  /** La sala en memoria; tras hibernar, se rehace con los adjuntos. */
  private ensureRoom(): ProjectPresenceRoom {
    if (this.room != null) return this.room;
    const room = new ProjectPresenceRoom();
    if (this.hibernates) {
      for (const ws of this.state.getWebSockets!()) {
        const att = ws.deserializeAttachment?.() as PresenceAttachment | null | undefined;
        if (att?.id != null && att.state != null) room.restore(att.id, ws, att.state);
      }
    }
    this.room = room;
    return room;
  }

  private persist(ws: HibernatableSocket, id: string): void {
    const state = this.ensureRoom().state(id);
    if (state != null) ws.serializeAttachment?.({ id, state } satisfies PresenceAttachment);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/notify" && request.method === "POST") {
      const event = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (event != null && typeof event === "object") this.ensureRoom().publish(event);
      return new Response(null, { status: 204 });
    }
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Se esperaba WebSocket", { status: 426 });
    }
    const userId = request.headers.get(RT_USER_ID_HEADER);
    if (userId == null || userId === "") return new Response("No autorizado", { status: 401 });
    let name = "";
    try {
      name = decodeURIComponent(request.headers.get(RT_USER_NAME_HEADER) ?? "");
    } catch {
      // nombre mal codificado: se entra sin nombre
    }

    const room = this.ensureRoom();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as HibernatableSocket & { accept(): void; addEventListener(ev: string, fn: (e: any) => void): void };
    // Identificador único también entre despertares (un contador se reiniciaría)
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    if (this.hibernates) {
      this.state.acceptWebSocket!(server, [id]);
      room.join(id, server, { userId, name });
      this.persist(server, id);
    } else {
      // Runtime sin hibernación (pruebas, wrangler antiguo): escuchas clásicas
      server.accept();
      room.join(id, server, { userId, name });
      server.addEventListener("message", (e: MessageEvent) => {
        const raw = String(e.data);
        if (raw === "ping") {
          server.send("pong");
          return;
        }
        room.message(id, raw);
      });
      server.addEventListener("close", () => room.leave(id));
      server.addEventListener("error", () => room.leave(id));
    }
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: unknown });
  }

  // --- Manejadores de la API de hibernación ---

  webSocketMessage(ws: HibernatableSocket, message: string | ArrayBuffer): void {
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    if (raw === "ping") {
      ws.send("pong");
      return;
    }
    const att = ws.deserializeAttachment?.() as PresenceAttachment | null | undefined;
    if (att?.id == null) return;
    if (this.ensureRoom().message(att.id, raw)) this.persist(ws, att.id);
  }

  webSocketClose(ws: HibernatableSocket): void {
    this.gone(ws);
    try {
      ws.close(1000, "adiós");
    } catch {
      // ya cerrado
    }
  }

  webSocketError(ws: HibernatableSocket): void {
    this.gone(ws);
  }

  private gone(ws: HibernatableSocket): void {
    const att = ws.deserializeAttachment?.() as PresenceAttachment | null | undefined;
    if (att?.id != null) this.ensureRoom().leave(att.id, true);
  }
}
