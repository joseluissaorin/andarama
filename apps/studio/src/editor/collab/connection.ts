/**
 * Conexión con la sala de edición del recorrido, separada de React para
 * poder probarla con relojes y sockets falsos.
 *
 *  - Antes de cada intento pide un billete a la API (dura dos minutos): así
 *    quitarle el acceso a alguien le cierra la puerta en la siguiente
 *    reconexión.
 *  - Reconexión con espera exponencial y algo de azar (0,8 s, 1,6 s... hasta
 *    30 s), para que cien pestañas no vuelvan todas en el mismo milisegundo
 *    tras un corte. Al volver la red o la pestaña, se reintenta en el acto.
 *  - Latido: «ping» cada 25 s; si en 10 s no llega nada, el socket se da por
 *    muerto (wifi que cambia, portátil que se duerme) y se reconecta.
 *  - Si la API dice que no (sin permiso, sin plan, sin tiempo real en la
 *    instancia), se para sin insistir: el editor funciona igual sin sala.
 */

export type CollabStatus = "connecting" | "online" | "offline" | "off";

export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

/** La API no deja entrar en la sala: no se insiste. */
export class CollabRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollabRefused";
  }
}

export interface CollabConnectionOptions {
  /** Pide un billete y devuelve la URL completa del WebSocket. Lanza CollabRefused si no hay acceso. */
  ticketUrl: () => Promise<string>;
  createSocket: (url: string) => SocketLike;
  onMessage: (msg: Record<string, unknown>) => void;
  onStatus: (status: CollabStatus) => void;
  /** Tras reconectar (no la primera vez): pueden haberse perdido avisos. */
  onReconnected?: () => void;
  timers?: Timers;
  random?: () => number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  heartbeatMs?: number;
  heartbeatTimeoutMs?: number;
}

const OPEN = 1;

export class CollabConnection {
  private socket: SocketLike | null = null;
  private attempt = 0;
  private everConnected = false;
  private stopped = false;
  private retryTimer: unknown = null;
  private heartbeatTimer: unknown = null;
  private deadlineTimer: unknown = null;
  private status: CollabStatus = "connecting";
  private readonly timers: Timers;
  private readonly opts: Required<Omit<CollabConnectionOptions, "onReconnected" | "timers">> & Pick<CollabConnectionOptions, "onReconnected">;

  constructor(opts: CollabConnectionOptions) {
    this.timers = opts.timers ?? {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
    };
    this.opts = {
      random: Math.random,
      baseDelayMs: 800,
      maxDelayMs: 30_000,
      heartbeatMs: 25_000,
      heartbeatTimeoutMs: 10_000,
      ...opts,
    };
  }

  get currentStatus(): CollabStatus {
    return this.status;
  }

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const s = this.socket;
    this.socket = null;
    if (s != null) {
      s.onclose = null;
      s.onmessage = null;
      try {
        s.close(1000, "fin");
      } catch {
        // ya cerrado
      }
    }
  }

  /** Envía si está abierto; si no, se descarta (la presencia se repite al volver). */
  send(msg: Record<string, unknown>): boolean {
    if (this.socket == null || this.socket.readyState !== OPEN || this.status !== "online") return false;
    try {
      this.socket.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  /** Volvió la red o la pestaña: si no hay conexión, se intenta ya. */
  nudge(): void {
    if (this.stopped || this.status === "off" || this.status === "online") return;
    if (this.socket != null) return;
    if (this.retryTimer != null) this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.attempt = 0;
    void this.connect();
  }

  private setStatus(status: CollabStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.opts.onStatus(status);
  }

  private clearTimers(): void {
    for (const t of [this.retryTimer, this.heartbeatTimer, this.deadlineTimer]) if (t != null) this.timers.clearTimeout(t);
    this.retryTimer = null;
    this.heartbeatTimer = null;
    this.deadlineTimer = null;
  }

  /** Espera antes del siguiente intento: exponencial, con tope y ±30 % de azar. */
  nextDelay(): number {
    const raw = Math.min(this.opts.maxDelayMs, this.opts.baseDelayMs * 2 ** this.attempt);
    return Math.round(raw * (0.7 + 0.6 * this.opts.random()));
  }

  private scheduleRetry(): void {
    if (this.stopped || this.status === "off") return;
    const delay = this.nextDelay();
    this.attempt++;
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    let url: string;
    try {
      url = await this.opts.ticketUrl();
    } catch (err) {
      if (this.stopped) return;
      if (err instanceof CollabRefused) {
        this.setStatus("off");
        return;
      }
      this.setStatus("offline");
      this.scheduleRetry();
      return;
    }
    if (this.stopped) return;
    let socket: SocketLike;
    try {
      socket = this.opts.createSocket(url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    socket.onmessage = (ev) => {
      if (this.socket !== socket) return;
      this.armDeadline(false);
      const raw = String(ev.data);
      if (raw === "pong") return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }
      if (msg.type === "welcome") {
        const reconnected = this.everConnected;
        this.everConnected = true;
        this.attempt = 0;
        this.setStatus("online");
        this.scheduleHeartbeat();
        this.opts.onMessage(msg);
        if (reconnected) this.opts.onReconnected?.();
        return;
      }
      this.opts.onMessage(msg);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearTimers();
      if (this.stopped) return;
      this.setStatus("offline");
      this.scheduleRetry();
    };
    socket.onerror = () => {
      // Siempre llega también onclose
    };
  }

  private scheduleHeartbeat(): void {
    if (this.heartbeatTimer != null) this.timers.clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = this.timers.setTimeout(() => {
      this.heartbeatTimer = null;
      const s = this.socket;
      if (s == null || s.readyState !== OPEN) return;
      try {
        s.send("ping");
      } catch {
        // se verá en el plazo
      }
      this.armDeadline(true);
      this.scheduleHeartbeat();
    }, this.opts.heartbeatMs);
  }

  /** Plazo para oír algo del servidor tras un ping; cualquier mensaje lo cumple. */
  private armDeadline(arm: boolean): void {
    if (this.deadlineTimer != null) this.timers.clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
    if (!arm) return;
    this.deadlineTimer = this.timers.setTimeout(() => {
      this.deadlineTimer = null;
      const s = this.socket;
      if (s == null) return;
      // Socket mudo: se cierra y se trata como un corte
      this.socket = null;
      s.onclose = null;
      s.onmessage = null;
      try {
        s.close(4000, "sin latido");
      } catch {
        // ya cerrado
      }
      this.clearTimers();
      if (this.stopped) return;
      this.setStatus("offline");
      this.scheduleRetry();
    }, this.opts.heartbeatTimeoutMs);
  }
}
