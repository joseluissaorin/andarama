import { describe, expect, it } from "vitest";
import { CollabConnection, CollabRefused, type CollabStatus, type SocketLike, type Timers } from "./connection";

class FakeTimers implements Timers {
  now = 0;
  private seq = 0;
  private pending = new Map<number, { at: number; fn: () => void }>();
  setTimeout = (fn: () => void, ms: number): unknown => {
    const id = ++this.seq;
    this.pending.set(id, { at: this.now + ms, fn });
    return id;
  };
  clearTimeout = (id: unknown): void => {
    this.pending.delete(id as number);
  };
  /** Avanza el reloj ejecutando lo que venza, en orden. */
  async advance(ms: number): Promise<void> {
    const end = this.now + ms;
    for (;;) {
      const next = [...this.pending.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (next == null) break;
      this.pending.delete(next[0]);
      this.now = next[1].at;
      next[1].fn();
      await flush();
    }
    this.now = end;
  }
  nextDelay(): number | null {
    const at = [...this.pending.values()].map((t) => t.at).sort((a, b) => a - b)[0];
    return at == null ? null : at - this.now;
  }
}

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(public url: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
  }
  // Lado del servidor
  accept(connectionId = "c1"): void {
    this.readyState = 1;
    this.onopen?.({});
    this.receive({ type: "welcome", connectionId, color: "#000" });
  }
  receive(msg: Record<string, unknown> | string): void {
    this.onmessage?.({ data: typeof msg === "string" ? msg : JSON.stringify(msg) });
  }
  drop(): void {
    this.readyState = 3;
    this.onclose?.({});
  }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function setup(opts: { ticket?: () => Promise<string> } = {}) {
  const timers = new FakeTimers();
  const sockets: FakeSocket[] = [];
  const statuses: CollabStatus[] = [];
  const messages: Record<string, unknown>[] = [];
  let reconnects = 0;
  let tickets = 0;
  const conn = new CollabConnection({
    ticketUrl: opts.ticket ?? (async () => `ws://x/rt/project/p?t=${++tickets}`),
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    onReconnected: () => reconnects++,
    timers,
    random: () => 0.5,
  });
  return { conn, timers, sockets, statuses, messages, reconnects: () => reconnects };
}

describe("conexión con la sala", () => {
  it("pide un billete, conecta y pasa a en línea con el saludo", async () => {
    const t = setup();
    t.conn.start();
    await flush();
    expect(t.sockets[0]!.url).toBe("ws://x/rt/project/p?t=1");
    t.sockets[0]!.accept();
    expect(t.statuses.at(-1)).toBe("online");
    expect(t.messages[0]).toMatchObject({ type: "welcome" });
  });

  it("al cortarse, reintenta con espera creciente y billete nuevo; al volver avisa para resincronizar", async () => {
    const t = setup();
    t.conn.start();
    await flush();
    t.sockets[0]!.accept();
    t.sockets[0]!.drop();
    expect(t.statuses.at(-1)).toBe("offline");
    expect(t.timers.nextDelay()).toBe(800);
    await t.timers.advance(800);
    expect(t.sockets.length).toBe(2);
    expect(t.sockets[1]!.url).toBe("ws://x/rt/project/p?t=2");
    t.sockets[1]!.drop();
    expect(t.timers.nextDelay()).toBe(1600);
    await t.timers.advance(1600);
    t.sockets[2]!.drop();
    expect(t.timers.nextDelay()).toBe(3200);
    await t.timers.advance(3200);
    t.sockets[3]!.accept();
    expect(t.statuses.at(-1)).toBe("online");
    expect(t.reconnects()).toBe(1);
    // Tras conectar, la espera vuelve a empezar desde abajo
    t.sockets[3]!.drop();
    expect(t.timers.nextDelay()).toBe(800);
  });

  it("la espera tiene tope", () => {
    const t = setup();
    for (let i = 0; i < 20; i++) (t.conn as unknown as { attempt: number }).attempt = i;
    expect(t.conn.nextDelay()).toBe(30_000);
  });

  it("sin respuesta al latido, da el socket por muerto y reconecta", async () => {
    const t = setup();
    t.conn.start();
    await flush();
    t.sockets[0]!.accept();
    await t.timers.advance(25_000);
    expect(t.sockets[0]!.sent).toContain("ping");
    await t.timers.advance(10_000);
    expect(t.sockets[0]!.closed).toBe(true);
    expect(t.statuses.at(-1)).toBe("offline");
    await t.timers.advance(800);
    expect(t.sockets.length).toBe(2);
  });

  it("con «pong» a tiempo, sigue conectada", async () => {
    const t = setup();
    t.conn.start();
    await flush();
    t.sockets[0]!.accept();
    await t.timers.advance(25_000);
    t.sockets[0]!.receive("pong");
    await t.timers.advance(10_000);
    expect(t.sockets[0]!.closed).toBe(false);
    expect(t.statuses.at(-1)).toBe("online");
  });

  it("si la API no da billete por permisos, se para sin insistir", async () => {
    const t = setup({
      ticket: async () => {
        throw new CollabRefused("sin permiso");
      },
    });
    t.conn.start();
    await flush();
    expect(t.statuses.at(-1)).toBe("off");
    expect(t.timers.nextDelay()).toBeNull();
  });

  it("si falla la red al pedir el billete, sale «sin conexión» y reintenta", async () => {
    let fail = true;
    let n = 0;
    const t = setup({
      ticket: async () => {
        if (fail) throw new Error("red");
        return `ws://x/?t=${++n}`;
      },
    });
    t.conn.start();
    await flush();
    expect(t.statuses.at(-1)).toBe("offline");
    fail = false;
    await t.timers.advance(800);
    t.sockets[0]!.accept();
    expect(t.statuses.at(-1)).toBe("online");
  });

  it("volver la red reintenta en el acto", async () => {
    const t = setup();
    t.conn.start();
    await flush();
    t.sockets[0]!.accept();
    t.sockets[0]!.drop();
    t.conn.nudge();
    await flush();
    expect(t.sockets.length).toBe(2);
  });

  it("solo envía con la sala en línea, y parar cierra sin reintentar", async () => {
    const t = setup();
    t.conn.start();
    await flush();
    expect(t.conn.send({ type: "where" })).toBe(false);
    t.sockets[0]!.accept();
    expect(t.conn.send({ type: "where" })).toBe(true);
    t.conn.stop();
    expect(t.sockets[0]!.closed).toBe(true);
    expect(t.timers.nextDelay()).toBeNull();
  });
});
