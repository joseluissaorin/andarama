import { describe, expect, it } from "vitest";
import { LiveTourRoom, type SocketLike } from "./rooms.js";

class FakeSocket implements SocketLike {
  sent: Record<string, unknown>[] = [];
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(): void {}
  last(type: string): Record<string, unknown> | undefined {
    return [...this.sent].reverse().find((m) => m.type === type);
  }
}

function sala(): { room: LiveTourRoom; guia: FakeSocket; asistente: FakeSocket } {
  const room = new LiveTourRoom("clave");
  const guia = new FakeSocket();
  const asistente = new FakeSocket();
  room.join("g", guia, { role: "guide", key: "clave" });
  room.join("a", asistente, { role: "attendee" });
  return { room, guia, asistente };
}

describe("visita guiada: paneles del guía", () => {
  it("abrir y cerrar un panel llega a los asistentes, no de vuelta al guía", () => {
    const { room, guia, asistente } = sala();
    room.message("g", JSON.stringify({ type: "panel", hotspot: "hs-texto" }));
    expect(asistente.last("panel")).toEqual({ type: "panel", hotspot: "hs-texto" });
    expect(guia.last("panel")).toBeUndefined();

    room.message("g", JSON.stringify({ type: "panel", hotspot: null }));
    expect(asistente.last("panel")).toEqual({ type: "panel", hotspot: null });
  });

  it("un asistente no puede abrir paneles a los demás", () => {
    const { room, guia } = sala();
    const otro = new FakeSocket();
    room.join("b", otro, { role: "attendee" });
    room.message("a", JSON.stringify({ type: "panel", hotspot: "hs" }));
    expect(otro.last("panel")).toBeUndefined();
    expect(guia.last("panel")).toBeUndefined();
  });

  it("una clave de guía falsa no da el rol de guía", () => {
    const room = new LiveTourRoom("clave");
    const impostor = new FakeSocket();
    const asistente = new FakeSocket();
    room.join("i", impostor, { role: "guide", key: "otra" });
    room.join("a", asistente, { role: "attendee" });
    room.message("i", JSON.stringify({ type: "panel", hotspot: "hs" }));
    expect(asistente.last("panel")).toBeUndefined();
  });

  it("quien llega tarde recibe el panel abierto con el estado", () => {
    const { room } = sala();
    room.message("g", JSON.stringify({ type: "view", scene: "aula", yaw: 1, pitch: 0, fov: 1.2 }));
    room.message("g", JSON.stringify({ type: "panel", hotspot: "hs-pdf" }));
    const tarde = new FakeSocket();
    room.join("t", tarde, { role: "attendee" });
    expect(tarde.last("state")).toMatchObject({ scene: "aula", panel: "hs-pdf" });
  });

  it("los identificadores raros se normalizan", () => {
    const { room, asistente } = sala();
    room.message("g", JSON.stringify({ type: "panel", hotspot: 42 }));
    expect(asistente.last("panel")).toEqual({ type: "panel", hotspot: null });
    room.message("g", JSON.stringify({ type: "panel", hotspot: "x".repeat(500) }));
    expect((asistente.last("panel")!.hotspot as string).length).toBe(128);
  });
});
