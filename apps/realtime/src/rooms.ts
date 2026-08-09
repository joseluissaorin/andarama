/**
 * Logica de salas de tiempo real, independiente de la plataforma. La usan
 * los Durable Objects (Cloudflare) y el servidor ws integrado (self-host).
 *
 * Dos tipos de sala:
 *  - LiveTourRoom: visita guiada (§2.15). Un guia controla escena y vista de
 *    N asistentes; puntero del guia; chat de texto; codigos efimeros.
 *  - ProjectPresenceRoom: presencia y bloqueo blando por escena en el
 *    Studio (§3.5) + difusion de comentarios/cambios.
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
          { type: "state", ...this.state, participants: this.participants.size, pointer: this.pointer },
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
      case "chat": {
        const text = String(msg.text ?? "").slice(0, 500);
        if (text === "") return;
        this.broadcast({ type: "chat", from: participant.name || (participant.role === "guide" ? "Guia" : "Visitante"), text });
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

interface PresenceMember {
  socket: SocketLike;
  userId: string;
  name: string;
  sceneId: string | null;
}

export class ProjectPresenceRoom {
  private members = new Map<string, PresenceMember>();
  /** sceneId -> connectionId que la esta editando (bloqueo blando). */
  private locks = new Map<string, string>();

  join(id: string, socket: SocketLike, hello: { userId?: string; name?: string }): void {
    this.members.set(id, {
      socket,
      userId: String(hello.userId ?? id),
      name: (hello.name ?? "").slice(0, 60),
      sceneId: null,
    });
    this.broadcastPresence();
  }

  leave(id: string): void {
    this.members.delete(id);
    for (const [sceneId, holder] of this.locks) {
      if (holder === id) this.locks.delete(sceneId);
    }
    this.broadcastPresence();
  }

  message(id: string, raw: string): void {
    const member = this.members.get(id);
    if (member == null) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    switch (msg.type) {
      case "scene": {
        const sceneId = msg.sceneId != null ? String(msg.sceneId) : null;
        // liberar bloqueo anterior
        for (const [sid, holder] of this.locks) {
          if (holder === id) this.locks.delete(sid);
        }
        member.sceneId = sceneId;
        if (sceneId != null) {
          const current = this.locks.get(sceneId);
          if (current == null || this.members.get(current) == null) {
            this.locks.set(sceneId, id);
          }
        }
        this.broadcastPresence();
        return;
      }
      case "changed": {
        // Notificacion de cambio (autosave): los demas refrescan
        this.broadcast({ type: "changed", entity: msg.entity, entityId: msg.entityId, by: member.name }, id);
        return;
      }
      case "comment": {
        this.broadcast({ type: "comment", by: member.name }, id);
        return;
      }
      default:
        return;
    }
  }

  private broadcastPresence(): void {
    const users = [...this.members.entries()].map(([cid, m]) => ({
      connectionId: cid,
      userId: m.userId,
      name: m.name,
      sceneId: m.sceneId,
    }));
    const locks: Record<string, { connectionId: string; name: string }> = {};
    for (const [sceneId, holder] of this.locks) {
      const m = this.members.get(holder);
      if (m != null) locks[sceneId] = { connectionId: holder, name: m.name };
    }
    this.broadcast({ type: "presence", users, locks });
  }

  private broadcast(msg: Record<string, unknown>, exceptId?: string): void {
    const data = JSON.stringify(msg);
    for (const [cid, m] of this.members) {
      if (cid === exceptId) continue;
      try {
        m.socket.send(data);
      } catch {
        // ignorar
      }
    }
  }
}
