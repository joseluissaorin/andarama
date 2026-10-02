import { describe, expect, it, vi } from "vitest";
import { LiveClient, shouldKeepFollowing, type LivePanels } from "./live.js";

// El visor completo arrastra Marzipano, que necesita DOM al cargarse
vi.mock("@andarama/viewer", () => ({ createIconSvg: () => null }));

/**
 * Visita guiada: cuando el guía abre un panel (texto, imagen, vídeo, PDF,
 * test...), quien le sigue ve el mismo; cuando lo cierra, se le cierra. Quien
 * se ha soltado no recibe nada hasta que vuelve a seguirle.
 */

function montar(role: "guide" | "attendee", escena = "a") {
  let actual = escena;
  const sceneListeners: (() => void)[] = [];
  const viewer = {
    tour: { scenes: [{ id: "a", hotspots: [{ id: "texto" }, { id: "pdf" }] }, { id: "b", hotspots: [{ id: "foto" }] }] },
    currentSceneId: () => actual,
    openHotspot: vi.fn((id: string) => {
      panels.openHotspotId = id;
    }),
    on: (evt: string, cb: () => void) => {
      if (evt === "sceneChange") sceneListeners.push(cb);
      return () => {};
    },
    view: () => ({ yaw: 0, pitch: 0, fov: 1 }),
    // Seguir al guía a otra escena: la carga es asíncrona
    goTo: vi.fn(() => Promise.resolve()),
    setView: vi.fn(),
  };
  const panels: LivePanels & { openHotspotId: string | null } = {
    onPanelChange: null,
    openHotspotId: null,
    close: vi.fn(() => {
      panels.openHotspotId = null;
    }),
    closeBubble: vi.fn(),
  };
  const client = new LiveClient(viewer as never, ((k: string) => k) as never, {} as never, { url: "ws://x", role }, panels);
  const sent: unknown[] = [];
  const priv = client as unknown as {
    ws: unknown;
    following: boolean;
    handle: (m: unknown) => void;
    startPanelSync: () => void;
    applyGuidePanel: () => void;
  };
  priv.ws = { readyState: WebSocket.OPEN, send: (d: string) => sent.push(JSON.parse(d)) };
  priv.startPanelSync();
  const cambiarEscena = (id: string): void => {
    actual = id;
    for (const cb of sceneListeners) cb();
  };
  return { viewer, panels, priv, sent, cambiarEscena };
}

describe("paneles en la visita guiada", () => {
  it("el guía envía lo que abre y lo que cierra", () => {
    const { panels, sent } = montar("guide");
    panels.onPanelChange?.("texto");
    panels.onPanelChange?.(null);
    expect(sent).toEqual([
      { type: "panel", hotspot: "texto" },
      { type: "panel", hotspot: null },
    ]);
  });

  it("quien sigue al guía abre y cierra el mismo panel", () => {
    const { viewer, panels, priv } = montar("attendee");
    priv.handle({ type: "panel", hotspot: "texto" });
    expect(viewer.openHotspot).toHaveBeenCalledWith("texto");
    priv.handle({ type: "panel", hotspot: null });
    expect(panels.close).toHaveBeenCalled();
    expect(panels.openHotspotId).toBeNull();
  });

  it("no se le cierra un panel que abrió por su cuenta", () => {
    const { panels, priv } = montar("attendee");
    panels.openHotspotId = "pdf";
    priv.handle({ type: "panel", hotspot: null });
    expect(panels.close).not.toHaveBeenCalled();
  });

  it("quien se ha soltado no recibe paneles; al volver a seguir, sí", () => {
    const { viewer, priv } = montar("attendee");
    priv.following = false;
    priv.handle({ type: "panel", hotspot: "texto" });
    expect(viewer.openHotspot).not.toHaveBeenCalled();
    priv.following = true;
    priv.applyGuidePanel();
    expect(viewer.openHotspot).toHaveBeenCalledWith("texto");
  });

  it("si el panel es de la escena a la que aún está llegando, se abre al llegar", () => {
    const { viewer, priv, cambiarEscena } = montar("attendee");
    priv.handle({ type: "state", scene: "b", yaw: 0, pitch: 0, fov: 1, participants: 2, panel: "foto" });
    expect(viewer.openHotspot).not.toHaveBeenCalledWith("foto");
    cambiarEscena("b");
    expect(viewer.openHotspot).toHaveBeenCalledWith("foto");
  });

  it("leer el panel o escribir en el chat no suelta al asistente", () => {
    const dentro = { closest: (sel: string) => (sel.includes(".anda-panel-backdrop") ? {} : null) };
    const fuera = { closest: () => null };
    expect(shouldKeepFollowing(dentro as never)).toBe(true);
    expect(shouldKeepFollowing(fuera as never)).toBe(false);
    expect(shouldKeepFollowing(null)).toBe(false);
  });
});
