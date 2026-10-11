import { describe, expect, it } from "vitest";
import { ProjectPresenceRoom, PRESENCE_COLORS, type SocketLike } from "./rooms.js";
import { ProjectPresenceDO, RT_USER_ID_HEADER, RT_USER_NAME_HEADER } from "./durable-objects.js";
import { signRealtimeTicket, verifyRealtimeTicket } from "./ticket.js";

class FakeSocket implements SocketLike {
  sent: (Record<string, unknown> | string)[] = [];
  closed = false;
  attachment: unknown = null;
  send(data: string): void {
    this.sent.push(data === "pong" ? data : (JSON.parse(data) as Record<string, unknown>));
  }
  close(): void {
    this.closed = true;
  }
  serializeAttachment(value: unknown): void {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment(): unknown {
    return this.attachment;
  }
  last(type: string): Record<string, unknown> | undefined {
    return [...this.sent].reverse().find((m): m is Record<string, unknown> => typeof m === "object" && m.type === type);
  }
  all(type: string): Record<string, unknown>[] {
    return this.sent.filter((m): m is Record<string, unknown> => typeof m === "object" && m.type === type);
  }
}

function clock(start = 1000): { now: () => number; tick: (ms?: number) => void } {
  let t = start;
  return { now: () => t, tick: (ms = 1) => void (t += ms) };
}

const where = (sceneId: string | null, focus: { kind: string; id: string } | null, tab = "scenes"): string =>
  JSON.stringify({ type: "where", sceneId, tab, focus });

describe("sala de edición: presencia", () => {
  it("saluda con el identificador de conexión y un color, y anuncia a todos", () => {
    const room = new ProjectPresenceRoom();
    const ana = new FakeSocket();
    const luis = new FakeSocket();
    room.join("a", ana, { userId: "u-ana", name: "Ana" });
    room.join("l", luis, { userId: "u-luis", name: "Luis" });
    expect(ana.last("welcome")).toMatchObject({ connectionId: "a", color: PRESENCE_COLORS[0] });
    expect(luis.last("welcome")).toMatchObject({ connectionId: "l", color: PRESENCE_COLORS[1] });
    const users = ana.last("presence")!.users as { name: string; color: string }[];
    expect(users.map((u) => u.name)).toEqual(["Ana", "Luis"]);
  });

  it("dos pestañas de la misma persona comparten color", () => {
    const room = new ProjectPresenceRoom();
    room.join("a1", new FakeSocket(), { userId: "u-ana", name: "Ana" });
    room.join("l", new FakeSocket(), { userId: "u-luis", name: "Luis" });
    const tab2 = new FakeSocket();
    room.join("a2", tab2, { userId: "u-ana", name: "Ana" });
    expect(tab2.last("welcome")!.color).toBe(PRESENCE_COLORS[0]);
  });

  it("al irse alguien, los demás dejan de verlo", () => {
    const room = new ProjectPresenceRoom();
    const ana = new FakeSocket();
    room.join("a", ana, { userId: "u-ana", name: "Ana" });
    room.join("l", new FakeSocket(), { userId: "u-luis", name: "Luis" });
    room.leave("l");
    expect((ana.last("presence")!.users as unknown[]).length).toBe(1);
    expect(room.size).toBe(1);
  });

  it("contesta al latido sin difundirlo", () => {
    const room = new ProjectPresenceRoom();
    const ana = new FakeSocket();
    const luis = new FakeSocket();
    room.join("a", ana, { userId: "u-ana" });
    room.join("l", luis, { userId: "u-luis" });
    const before = luis.sent.length;
    room.message("a", "ping");
    expect(ana.sent.at(-1)).toBe("pong");
    expect(luis.sent.length).toBe(before);
  });
});

describe("sala de edición: bloqueo blando", () => {
  it("el primero que abre el panel de un punto se lo queda; el segundo lo ve bloqueado", () => {
    const c = clock();
    const room = new ProjectPresenceRoom(c.now);
    const ana = new FakeSocket();
    const luis = new FakeSocket();
    room.join("a", ana, { userId: "u-ana", name: "Ana" });
    room.join("l", luis, { userId: "u-luis", name: "Luis" });
    room.message("a", where("s1", { kind: "hotspot", id: "h1" }));
    c.tick();
    room.message("l", where("s1", { kind: "hotspot", id: "h1" }));
    const locks = luis.last("presence")!.locks as Record<string, { name: string; connectionId: string }>;
    expect(locks["hotspot:h1"]).toMatchObject({ name: "Ana", connectionId: "a" });
  });

  it("al cerrar el panel quien lo tenía, pasa al siguiente que lo tiene abierto", () => {
    const c = clock();
    const room = new ProjectPresenceRoom(c.now);
    const luis = new FakeSocket();
    room.join("a", new FakeSocket(), { userId: "u-ana", name: "Ana" });
    room.join("l", luis, { userId: "u-luis", name: "Luis" });
    room.message("a", where("s1", { kind: "scene", id: "s1" }));
    c.tick();
    room.message("l", where("s1", { kind: "scene", id: "s1" }));
    room.message("a", where("s2", { kind: "scene", id: "s2" }));
    const locks = luis.last("presence")!.locks as Record<string, { name: string }>;
    expect(locks["scene:s1"]!.name).toBe("Luis");
    expect(locks["scene:s2"]!.name).toBe("Ana");
  });

  it("irse libera el bloqueo", () => {
    const room = new ProjectPresenceRoom();
    const luis = new FakeSocket();
    room.join("a", new FakeSocket(), { userId: "u-ana", name: "Ana" });
    room.join("l", luis, { userId: "u-luis", name: "Luis" });
    room.message("a", where("s1", { kind: "hotspot", id: "h1" }));
    room.leave("a");
    expect(luis.last("presence")!.locks).toEqual({});
  });

  it("repetir el mismo «where» no cambia nada ni roba el turno", () => {
    const c = clock();
    const room = new ProjectPresenceRoom(c.now);
    room.join("a", new FakeSocket(), { userId: "u-ana", name: "Ana" });
    room.join("l", new FakeSocket(), { userId: "u-luis", name: "Luis" });
    room.message("a", where("s1", { kind: "scene", id: "s1" }));
    c.tick();
    room.message("l", where("s1", { kind: "scene", id: "s1" }));
    c.tick();
    expect(room.message("l", where("s1", { kind: "scene", id: "s1" }))).toBe(false);
    expect(room.locks()["scene:s1"]!.name).toBe("Ana");
  });

  it("el cliente anterior («scene») sigue bloqueando la escena", () => {
    const room = new ProjectPresenceRoom();
    room.join("a", new FakeSocket(), { userId: "u-ana", name: "Ana" });
    room.message("a", JSON.stringify({ type: "scene", sceneId: "s9" }));
    expect(room.locks()["scene:s9"]!.name).toBe("Ana");
  });

  it("descarta identificadores raros", () => {
    const room = new ProjectPresenceRoom();
    room.join("a", new FakeSocket(), { userId: "u-ana", name: "Ana" });
    room.message("a", where("<script>", { kind: "hotspot", id: "x".repeat(200) }));
    expect(room.locks()).toEqual({});
    expect(room.state("a")!.sceneId).toBeNull();
    room.message("a", JSON.stringify({ type: "where", sceneId: "s1", focus: { kind: "otra", id: "h1" } }));
    expect(room.state("a")!.focus).toBeNull();
  });
});

describe("sala de edición: miradas y cambios", () => {
  it("la mirada llega a los demás, no de vuelta, y quien entra la recibe", () => {
    const room = new ProjectPresenceRoom();
    const ana = new FakeSocket();
    const luis = new FakeSocket();
    room.join("a", ana, { userId: "u-ana", name: "Ana" });
    room.join("l", luis, { userId: "u-luis", name: "Luis" });
    room.message("a", JSON.stringify({ type: "view", sceneId: "s1", yaw: 1.5, pitch: -0.2, pointer: { yaw: 1.4, pitch: 0 } }));
    expect(luis.last("view")).toEqual({
      type: "view",
      connectionId: "a",
      view: { sceneId: "s1", yaw: 1.5, pitch: -0.2, pointer: { yaw: 1.4, pitch: 0 } },
    });
    expect(ana.last("view")).toBeUndefined();
    const tarde = new FakeSocket();
    room.join("t", tarde, { userId: "u-t", name: "Tarde" });
    expect(tarde.last("view")!.connectionId).toBe("a");
  });

  it("cambiar de escena borra la mirada vieja", () => {
    const room = new ProjectPresenceRoom();
    const luis = new FakeSocket();
    room.join("a", new FakeSocket(), { userId: "u-ana" });
    room.join("l", luis, { userId: "u-luis" });
    room.message("a", JSON.stringify({ type: "view", sceneId: "s1", yaw: 0, pitch: 0 }));
    room.message("a", where("s2", null));
    expect(luis.last("view")).toEqual({ type: "view", connectionId: "a", view: null });
  });

  it("ignora miradas con números que no lo son", () => {
    const room = new ProjectPresenceRoom();
    const luis = new FakeSocket();
    room.join("a", new FakeSocket(), { userId: "u-ana" });
    room.join("l", luis, { userId: "u-luis" });
    expect(room.message("a", JSON.stringify({ type: "view", sceneId: "s1", yaw: "x", pitch: 0 }))).toBe(false);
    expect(luis.last("view")).toBeUndefined();
  });

  it("los cambios los publica el servidor y llegan a todos; un cliente no puede fingirlos", () => {
    const room = new ProjectPresenceRoom();
    const ana = new FakeSocket();
    const luis = new FakeSocket();
    room.join("a", ana, { userId: "u-ana" });
    room.join("l", luis, { userId: "u-luis" });
    room.message("a", JSON.stringify({ type: "changed", kind: "scene", op: "delete", id: "s1" }));
    expect(luis.last("changed")).toBeUndefined();
    room.publish({ kind: "scene", op: "upsert", row: { id: "s1", version: 3 }, origin: "a", type: "otra" });
    expect(luis.last("changed")).toMatchObject({ type: "changed", kind: "scene", row: { version: 3 } });
    expect(ana.last("changed")).toMatchObject({ origin: "a" });
  });

  it("se reconstruye desde el estado guardado sin avisar a nadie", () => {
    const room = new ProjectPresenceRoom();
    const ana = new FakeSocket();
    room.join("a", ana, { userId: "u-ana", name: "Ana" });
    room.message("a", where("s1", { kind: "scene", id: "s1" }));
    const saved = room.state("a")!;

    const woken = new ProjectPresenceRoom();
    const sameSocket = new FakeSocket();
    woken.restore("a", sameSocket, saved);
    expect(sameSocket.sent).toEqual([]);
    expect(woken.locks()["scene:s1"]!.name).toBe("Ana");
  });
});

describe("billete de la sala", () => {
  const SECRET = "secreto-de-prueba";

  it("ida y vuelta con la identidad", async () => {
    const { ticket } = await signRealtimeTicket(SECRET, { projectId: "p1", userId: "u1", name: "Ana Pérez" });
    expect(await verifyRealtimeTicket(SECRET, ticket, "p1")).toEqual({ projectId: "p1", userId: "u1", name: "Ana Pérez" });
  });

  it("no vale para otro recorrido, con otro secreto, caducado ni manipulado", async () => {
    const now = 1_000_000;
    const { ticket } = await signRealtimeTicket(SECRET, { projectId: "p1", userId: "u1", name: "Ana" }, { now, ttlMs: 1000 });
    expect(await verifyRealtimeTicket(SECRET, ticket, "p2", now)).toBeNull();
    expect(await verifyRealtimeTicket("otro", ticket, "p1", now)).toBeNull();
    expect(await verifyRealtimeTicket(SECRET, ticket, "p1", now + 2000)).toBeNull();
    const [body, sig] = ticket.split(".");
    const forged = JSON.parse(atob(body!.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
    forged.u = "admin";
    const forgedBody = btoa(JSON.stringify(forged)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await verifyRealtimeTicket(SECRET, `${forgedBody}.${sig}`, "p1", now)).toBeNull();
    expect(await verifyRealtimeTicket(SECRET, "basura", "p1", now)).toBeNull();
    expect(await verifyRealtimeTicket(SECRET, null, "p1", now)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Durable Object con hibernación (estado y sockets simulados)
// ---------------------------------------------------------------------------

class FakeDoState {
  sockets: FakeSocket[] = [];
  autoResponse: unknown = null;
  storage = { get: async () => undefined, put: async () => {} };
  acceptWebSocket(ws: FakeSocket): void {
    this.sockets.push(ws);
  }
  getWebSockets(): FakeSocket[] {
    return this.sockets.filter((s) => !s.closed);
  }
  setWebSocketAutoResponse(pair: unknown): void {
    this.autoResponse = pair;
  }
}

describe("Durable Object de la sala", () => {
  // WebSocketPair y Response 101 solo existen en el runtime de Workers
  const g = globalThis as Record<string, unknown>;
  const installRuntime = (): void => {
    g.WebSocketPair = class {
      0 = new FakeSocket();
      1 = new FakeSocket();
    };
    g.WebSocketRequestResponsePair = class {
      constructor(
        public request: string,
        public response: string,
      ) {}
    };
  };
  const upgrade = (user: string, name: string): Request =>
    ({
      url: "https://do/connect",
      method: "GET",
      headers: new Headers({ upgrade: "websocket", [RT_USER_ID_HEADER]: user, [RT_USER_NAME_HEADER]: encodeURIComponent(name) }),
    }) as unknown as Request;

  const connect = async (obj: ProjectPresenceDO, state: FakeDoState, user: string, name: string): Promise<FakeSocket> => {
    const realResponse = globalThis.Response;
    // Response no admite status 101 fuera de Workers
    g.Response = class {
      constructor(
        public body: unknown,
        public init: { status: number },
      ) {}
      get status(): number {
        return this.init.status;
      }
    };
    try {
      await obj.fetch(upgrade(user, name));
    } finally {
      g.Response = realResponse;
    }
    return state.sockets.at(-1)!;
  };

  it("deja que el runtime conteste al latido y guarda el estado en el adjunto", async () => {
    installRuntime();
    const state = new FakeDoState();
    const obj = new ProjectPresenceDO(state);
    expect(state.autoResponse).toMatchObject({ request: "ping", response: "pong" });
    const ana = await connect(obj, state, "u-ana", "Ana Núñez");
    expect(ana.last("welcome")).toBeDefined();
    const att = ana.deserializeAttachment() as { id: string; state: { name: string } };
    expect(att.state.name).toBe("Ana Núñez");
    obj.webSocketMessage(ana, where("s1", { kind: "scene", id: "s1" }));
    expect((ana.deserializeAttachment() as { state: { sceneId: string } }).state.sceneId).toBe("s1");
  });

  it("tras hibernar, se rehace la sala con los adjuntos y sigue difundiendo", async () => {
    installRuntime();
    const state = new FakeDoState();
    const first = new ProjectPresenceDO(state);
    const ana = await connect(first, state, "u-ana", "Ana");
    const luis = await connect(first, state, "u-luis", "Luis");
    first.webSocketMessage(ana, where("s1", { kind: "hotspot", id: "h1" }));

    // El objeto se duerme: la memoria se pierde, los sockets y adjuntos no
    const woken = new ProjectPresenceDO(state);
    woken.webSocketMessage(luis, where("s1", { kind: "hotspot", id: "h1" }));
    const locks = luis.last("presence")!.locks as Record<string, { name: string }>;
    expect(locks["hotspot:h1"]!.name).toBe("Ana");

    // Aviso interno de la API tras guardar
    await woken.fetch(new Request("https://do/notify", { method: "POST", body: JSON.stringify({ kind: "settings", version: 2 }) }));
    expect(ana.last("changed")).toMatchObject({ kind: "settings", version: 2 });

    // Ana cierra: Luis deja de verla aunque la sala acabe de despertar
    ana.closed = true;
    const again = new ProjectPresenceDO(state);
    again.webSocketClose(ana);
    expect((luis.last("presence")!.users as unknown[]).length).toBe(1);
  });

  it("sin identidad del Worker no se entra", async () => {
    installRuntime();
    const state = new FakeDoState();
    const obj = new ProjectPresenceDO(state);
    const res = await obj.fetch({ url: "https://do/connect", method: "GET", headers: new Headers({ upgrade: "websocket" }) } as unknown as Request);
    expect(res.status).toBe(401);
    expect(state.sockets.length).toBe(0);
  });
});
