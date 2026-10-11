import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { createRealtimeServer, type RealtimeNodeServer } from "./node.js";
import { signRealtimeTicket } from "./ticket.js";

/** Servidor self-host de verdad (http + ws) con dos clientes reales. */

const SECRET = "secreto-node";
let http: Server;
let rt: RealtimeNodeServer;
let base = "";

beforeAll(async () => {
  rt = await createRealtimeServer({ secret: SECRET });
  http = createServer((_req, res) => res.end("ok"));
  http.on("upgrade", (req, socket, head) => {
    if (!rt.handleUpgrade(req, socket, head)) socket.destroy();
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  base = `ws://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterAll(() => {
  rt.close();
  http.close();
});

interface Client {
  ws: WebSocket;
  messages: Record<string, unknown>[];
  next: (type: string, pred?: (m: Record<string, unknown>) => boolean) => Promise<Record<string, unknown>>;
}

async function open(projectId: string, userId: string, name: string): Promise<Client> {
  const { ticket } = await signRealtimeTicket(SECRET, { projectId, userId, name });
  const ws = new WebSocket(`${base}/rt/project/${projectId}?t=${encodeURIComponent(ticket)}`);
  const messages: Record<string, unknown>[] = [];
  const waiters: { type: string; pred?: (m: Record<string, unknown>) => boolean; resolve: (m: Record<string, unknown>) => void }[] = [];
  ws.on("message", (data) => {
    const raw = String(data);
    const msg = raw === "pong" ? { type: "pong" } : (JSON.parse(raw) as Record<string, unknown>);
    messages.push(msg);
    for (const w of [...waiters]) {
      if (w.type === msg.type && (w.pred == null || w.pred(msg))) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  const next = (type: string, pred?: (m: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> => {
    const found = messages.find((m) => m.type === type && (pred == null || pred(m)));
    if (found != null) {
      messages.splice(messages.indexOf(found), 1);
      return Promise.resolve(found);
    }
    return new Promise((resolve) => waiters.push({ type, pred, resolve }));
  };
  return { ws, messages, next };
}

describe("tiempo real self-host (ws)", () => {
  it("rechaza la sala de edición sin billete válido", async () => {
    const ws = new WebSocket(`${base}/rt/project/p1?t=falso`);
    const status = await new Promise<number>((resolve) => {
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      ws.on("error", () => resolve(-1));
    });
    expect(status).toBe(401);
  });

  it("un billete de otro recorrido no abre este", async () => {
    const { ticket } = await signRealtimeTicket(SECRET, { projectId: "otro", userId: "u", name: "X" });
    const ws = new WebSocket(`${base}/rt/project/p1?t=${encodeURIComponent(ticket)}`);
    const status = await new Promise<number>((resolve) => {
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      ws.on("error", () => resolve(-1));
    });
    expect(status).toBe(401);
  });

  it("dos personas se ven, ven el bloqueo y reciben los cambios", async () => {
    const ana = await open("p1", "u-ana", "Ana");
    const welcome = await ana.next("welcome");
    const luis = await open("p1", "u-luis", "Luis");
    await luis.next("welcome");
    const presence = await ana.next("presence", (m) => (m.users as unknown[]).length === 2);
    expect((presence.users as { name: string }[]).map((u) => u.name).sort()).toEqual(["Ana", "Luis"]);

    ana.ws.send(JSON.stringify({ type: "where", sceneId: "s1", tab: "scenes", focus: { kind: "hotspot", id: "h1" } }));
    const locked = await luis.next("presence", (m) => (m.locks as Record<string, unknown>)["hotspot:h1"] != null);
    expect((locked.locks as Record<string, { name: string; connectionId: string }>)["hotspot:h1"]).toMatchObject({
      name: "Ana",
      connectionId: welcome.connectionId,
    });

    await rt.notifyProject("p1", { kind: "hotspot", op: "delete", id: "h1" });
    expect(await luis.next("changed")).toMatchObject({ kind: "hotspot", op: "delete", id: "h1" });
    expect(await ana.next("changed")).toMatchObject({ kind: "hotspot" });

    ana.ws.send("ping");
    expect(await ana.next("pong")).toEqual({ type: "pong" });

    ana.ws.close();
    await luis.next("presence", (m) => (m.users as unknown[]).length === 1);
    luis.ws.close();
  });

  it("los cambios de un recorrido no llegan a la sala de otro", async () => {
    const a = await open("pa", "u1", "Uno");
    await a.next("welcome");
    const b = await open("pb", "u2", "Dos");
    await b.next("welcome");
    await rt.notifyProject("pa", { kind: "settings", version: 1 });
    await a.next("changed");
    await new Promise((r) => setTimeout(r, 50));
    expect(b.messages.some((m) => m.type === "changed")).toBe(false);
    a.ws.close();
    b.ws.close();
  });
});
