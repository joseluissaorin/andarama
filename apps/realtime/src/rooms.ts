/**
 * Logica de salas de tiempo real, independiente de la plataforma. La usan
 * los Durable Objects (Cloudflare) y el servidor ws integrado (self-host).
 *
 * Dos tipos de sala:
 *  - LiveTourRoom: visita guiada (§2.15). Un guia controla escena y vista de
 *    N asistentes; puntero del guia; paneles que abre el guia; chat de
 *    texto; codigos efimeros.
 *  - ProjectPresenceRoom: edición en grupo en el Studio (§3.5). Quién está,
 *    en qué escena y qué panel tiene abierto (bloqueo blando por escena o
 *    punto), dónde mira cada uno, y la difusión de los cambios que la API
 *    acaba de guardar. La API sigue siendo la fuente de la verdad: la sala
 *    solo avisa «cambió X (id, versión)» y cada cliente fusiona.
 */

export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface LiveParticipant {
  socket: SocketLike;
  role: "guide" | "attendee";
  name: string;
}

export class LiveTourRoom {
  private participants = new Map<string, LiveParticipant>();
  private state: { scene: string; yaw: number; pitch: number; fov: number } | null = null;
  private pointer: { yaw: number; pitch: number } | null = null;
  /** Hotspot cuyo panel tiene abierto el guia (null: ninguno). */
  private panel: string | null = null;
  /** Clave que autoriza el rol de guia. */
  constructor(private guideKey: string) {}

  get size(): number {
    return this.participants.size;
  }

  join(id: string, socket: SocketLike, hello: { role: string; name?: string; key?: string }): void {
    const role: "guide" | "attendee" = hello.role === "guide" && hello.key === this.guideKey ? "guide" : "attendee";
    this.participants.set(id, { socket, role, name: (hello.name ?? "").slice(0, 40) });
    // Estado actual al recien llegado
    if (this.state != null) {
      this.sendTo(socket, {
        type: "state",
        ...this.state,
        participants: this.participants.size,
        pointer: this.pointer,
        panel: this.panel,
      });
    } else {
      this.sendTo(socket, { type: "participants", count: this.participants.size });
    }
    this.broadcast({ type: "participants", count: this.participants.size }, id);
  }

  leave(id: string): void {
    const participant = this.participants.get(id);
    this.participants.delete(id);
    if (participant?.role === "guide") {
      // El guia se va: notificar el fin de la visita
      this.broadcast({ type: "end" });
    } else {
      this.broadcast({ type: "participants", count: this.participants.size });
    }
  }

  message(id: string, raw: string): void {
    const participant = this.participants.get(id);
    if (participant == null) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    switch (msg.type) {
      case "view": {
        if (participant.role !== "guide") return;
        this.state = {
          scene: String(msg.scene ?? ""),
          yaw: Number(msg.yaw ?? 0),
          pitch: Number(msg.pitch ?? 0),
          fov: Number(msg.fov ?? 1.2),
        };
        this.broadcast(
          { type: "state", ...this.state, participants: this.participants.size, pointer: this.pointer, panel: this.panel },
          id,
        );
        return;
      }
      case "pointer": {
        if (participant.role !== "guide") return;
        const p = msg.pointer as { yaw: number; pitch: number } | null;
        this.pointer = p != null ? { yaw: Number(p.yaw), pitch: Number(p.pitch) } : null;
        this.broadcast({ type: "pointer", pointer: this.pointer }, id);
        return;
      }
      case "panel": {
        // El guia abre (id del hotspot) o cierra (null) un panel; los
        // asistentes que le siguen lo abren o cierran igual
        if (participant.role !== "guide") return;
        this.panel = typeof msg.hotspot === "string" && msg.hotspot !== "" ? msg.hotspot.slice(0, 128) : null;
        this.broadcast({ type: "panel", hotspot: this.panel }, id);
        return;
      }
      case "chat": {
        const text = String(msg.text ?? "").slice(0, 500);
        if (text === "") return;
        this.broadcast({ type: "chat", from: participant.name || (participant.role === "guide" ? "Guía" : "Visitante"), text });
        return;
      }
      default:
        return;
    }
  }

  private broadcast(msg: Record<string, unknown>, exceptId?: string): void {
    const data = JSON.stringify(msg);
    for (const [pid, p] of this.participants) {
      if (pid === exceptId) continue;
      try {
        p.socket.send(data);
      } catch {
        // socket roto: se limpiara en leave
      }
    }
  }

  private sendTo(socket: SocketLike, msg: Record<string, unknown>): void {
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      // ignorar
    }
  }
}

// ---------------------------------------------------------------------------
// Sala de edición de un recorrido (presencia, bloqueo blando y cambios)
// ---------------------------------------------------------------------------

/** Qué panel tiene abierto alguien: lo que «está editando». */
export interface PresenceFocus {
  kind: "scene" | "hotspot";
  id: string;
}

/** Dónde mira (centro de la vista) y, si lo hay, dónde apunta el ratón. */
export interface PresenceView {
  sceneId: string;
  yaw: number;
  pitch: number;
  pointer: { yaw: number; pitch: number } | null;
}

/**
 * Estado de una conexión. Es todo lo que la sala sabe de ella y se puede
 * serializar: el Durable Object lo guarda en el adjunto del WebSocket para
 * reconstruir la sala al despertar de la hibernación.
 */
export interface PresenceMemberState {
  userId: string;
  name: string;
  color: string;
  joinedAt: number;
  /** Escena abierta en el editor. */
  sceneId: string | null;
  /** Pestaña del editor (escenas, grafo, ajustes...). */
  tab: string | null;
  focus: PresenceFocus | null;
  /** Desde cuándo tiene ese panel abierto: el primero se queda el bloqueo. */
  focusAt: number;
  view: PresenceView | null;
}

/**
 * Colores de las personas: distinguibles entre sí y legibles con texto blanco
 * encima, en tema claro y oscuro. Dos pestañas de la misma persona comparten
 * color; dos personas, mientras quepan, no.
 */
export const PRESENCE_COLORS = ["#d9480f", "#1971c2", "#7048e8", "#0c8599", "#c2255c", "#2f9e44", "#e67700", "#5f3dc4"] as const;

const MAX_ID = 64;

function cleanId(value: unknown): string | null {
  if (typeof value !== "string" || value === "" || value.length > MAX_ID) return null;
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1e6 ? value : null;
}

function cleanAngles(value: unknown): { yaw: number; pitch: number } | null {
  if (value == null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  // Radianes en los panoramas; en las escenas planas, coordenadas de imagen
  const yaw = finite(v.yaw);
  const pitch = finite(v.pitch);
  return yaw != null && pitch != null ? { yaw, pitch } : null;
}

export type PresenceLock = { connectionId: string; userId: string; name: string; color: string };

export class ProjectPresenceRoom {
  private members = new Map<string, { socket: SocketLike; state: PresenceMemberState }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  get size(): number {
    return this.members.size;
  }

  /** Estado serializable de una conexión (para el adjunto del Durable Object). */
  state(id: string): PresenceMemberState | null {
    const m = this.members.get(id);
    return m != null ? { ...m.state } : null;
  }

  /**
   * Alguien entra. La identidad la pone quien autentica (el billete firmado
   * por la API), nunca el propio cliente.
   */
  join(id: string, socket: SocketLike, identity: { userId: string; name?: string }): void {
    const userId = String(identity.userId).slice(0, MAX_ID);
    const state: PresenceMemberState = {
      userId,
      name: (identity.name ?? "").trim().slice(0, 60),
      color: this.colorFor(userId),
      joinedAt: this.now(),
      sceneId: null,
      tab: null,
      focus: null,
      focusAt: 0,
      view: null,
    };
    this.members.set(id, { socket, state });
    this.sendTo(socket, { type: "welcome", connectionId: id, color: state.color });
    // Quien llega ve también dónde miran los demás, sin esperar a que se muevan
    for (const [cid, m] of this.members) {
      if (cid !== id && m.state.view != null) this.sendTo(socket, this.viewMessage(cid, m.state));
    }
    this.broadcastPresence();
  }

  /**
   * Vuelve a meter una conexión que ya estaba (el Durable Object despierta de
   * la hibernación y reconstruye la sala). No avisa a nadie: nada ha cambiado.
   */
  restore(id: string, socket: SocketLike, state: PresenceMemberState): void {
    this.members.set(id, { socket, state: { ...state } });
  }

  /**
   * Alguien se va. `force` avisa a los demás aunque la sala no lo conociera:
   * al despertar de la hibernación, el socket que se cierra puede no estar ya
   * entre los que se reconstruyen.
   */
  leave(id: string, force = false): void {
    if (!this.members.delete(id) && !force) return;
    this.broadcastPresence();
  }

  /**
   * Mensaje de un cliente. Devuelve true si cambió el estado de esa conexión
   * (el Durable Object lo vuelve a guardar en el adjunto).
   */
  message(id: string, raw: string): boolean {
    const member = this.members.get(id);
    if (member == null) return false;
    if (raw === "ping") {
      this.sendTo(member.socket, "pong");
      return false;
    }
    if (raw.length > 4096) return false;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return false;
    }
    if (msg == null || typeof msg !== "object") return false;
    const state = member.state;
    switch (msg.type) {
      case "where": {
        const sceneId = cleanId(msg.sceneId);
        const tab = typeof msg.tab === "string" ? msg.tab.slice(0, 24) : null;
        const f = msg.focus as Record<string, unknown> | null | undefined;
        const kind = f?.kind === "scene" || f?.kind === "hotspot" ? f.kind : null;
        const focusId = cleanId(f?.id);
        const focus: PresenceFocus | null = kind != null && focusId != null ? { kind, id: focusId } : null;
        const sameFocus = focus?.kind === state.focus?.kind && focus?.id === state.focus?.id;
        if (sameFocus && sceneId === state.sceneId && tab === state.tab) return false;
        if (!sameFocus) state.focusAt = focus != null ? this.now() : 0;
        state.focus = focus;
        state.tab = tab;
        if (sceneId !== state.sceneId) {
          state.sceneId = sceneId;
          // La mirada en otra escena ya no dice nada
          if (state.view != null) {
            state.view = null;
            this.broadcast(this.viewMessage(id, state), id);
          }
        }
        this.broadcastPresence();
        return true;
      }
      // Cliente anterior: solo decía la escena, y estar en ella era editarla
      case "scene": {
        const sceneId = cleanId(msg.sceneId);
        return this.message(
          id,
          JSON.stringify({ type: "where", sceneId, tab: "scenes", focus: sceneId != null ? { kind: "scene", id: sceneId } : null }),
        );
      }
      case "view": {
        const sceneId = cleanId(msg.sceneId);
        const center = cleanAngles(msg);
        if (sceneId == null || center == null) {
          if (state.view == null) return false;
          state.view = null;
        } else {
          state.view = { sceneId, yaw: center.yaw, pitch: center.pitch, pointer: cleanAngles(msg.pointer) };
        }
        this.broadcast(this.viewMessage(id, state), id);
        return true;
      }
      default:
        // «hello» de clientes anteriores, «changed» y cualquier otra cosa: la
        // identidad la puso el billete y los cambios los anuncia la API
        return false;
    }
  }

  /**
   * Cambio guardado en la API: se difunde a todas las conexiones. Lo llama
   * el servidor tras una escritura correcta; los clientes no pueden.
   */
  publish(event: Record<string, unknown>): void {
    this.broadcast({ ...event, type: "changed" });
  }

  /** Quién tiene cada panel: el que lo abrió primero entre los presentes. */
  locks(): Record<string, PresenceLock> {
    const holders = new Map<string, { id: string; at: number }>();
    for (const [cid, m] of this.members) {
      const f = m.state.focus;
      if (f == null) continue;
      const key = `${f.kind}:${f.id}`;
      const current = holders.get(key);
      if (current == null || m.state.focusAt < current.at || (m.state.focusAt === current.at && cid < current.id)) {
        holders.set(key, { id: cid, at: m.state.focusAt });
      }
    }
    const out: Record<string, PresenceLock> = {};
    for (const [key, h] of holders) {
      const m = this.members.get(h.id)!;
      out[key] = { connectionId: h.id, userId: m.state.userId, name: m.state.name, color: m.state.color };
    }
    return out;
  }

  private colorFor(userId: string): string {
    for (const m of this.members.values()) {
      if (m.state.userId === userId) return m.state.color;
    }
    const used = new Set([...this.members.values()].map((m) => m.state.color));
    const free = PRESENCE_COLORS.find((c) => !used.has(c));
    if (free != null) return free;
    // Más personas que colores: se repite uno, elegido por la propia persona
    let h = 0;
    for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PRESENCE_COLORS[h % PRESENCE_COLORS.length]!;
  }

  private viewMessage(id: string, state: PresenceMemberState): Record<string, unknown> {
    return { type: "view", connectionId: id, view: state.view };
  }

  private broadcastPresence(): void {
    const users = [...this.members.entries()].map(([cid, m]) => ({
      connectionId: cid,
      userId: m.state.userId,
      name: m.state.name,
      color: m.state.color,
      sceneId: m.state.sceneId,
      tab: m.state.tab,
      focus: m.state.focus,
    }));
    this.broadcast({ type: "presence", users, locks: this.locks() });
  }

  private broadcast(msg: Record<string, unknown>, exceptId?: string): void {
    const data = JSON.stringify(msg);
    for (const [cid, m] of this.members) {
      if (cid === exceptId) continue;
      try {
        m.socket.send(data);
      } catch {
        // socket roto: se limpiará al cerrarse
      }
    }
  }

  private sendTo(socket: SocketLike, msg: Record<string, unknown> | string): void {
    try {
      socket.send(typeof msg === "string" ? msg : JSON.stringify(msg));
    } catch {
      // ignorar
    }
  }
}
