import { describe, expect, it } from "vitest";
import { sceneOwnAudio, setSceneAudioMuted } from "./sceneAudio";

describe("sonido propio de la escena", () => {
  const conAmbiente = JSON.stringify({ ambient: { url: "media:a" } });

  it("distingue sin sonido, sonando y desactivado", () => {
    expect(sceneOwnAudio(null)).toBe("none");
    expect(sceneOwnAudio(JSON.stringify({ replaceGlobal: true }))).toBe("none");
    expect(sceneOwnAudio(conAmbiente)).toBe("on");
    expect(sceneOwnAudio(JSON.stringify({ narration: { url: "media:n" }, muted: true }))).toBe("off");
    expect(sceneOwnAudio(JSON.stringify({ spatial: [{ url: "media:s" }] }))).toBe("on");
    expect(sceneOwnAudio("{roto")).toBe("none");
  });

  it("desactivar conserva los ficheros y volver a activar quita la marca", () => {
    const off = setSceneAudioMuted(conAmbiente, true);
    expect(JSON.parse(off!)).toEqual({ ambient: { url: "media:a" }, muted: true });
    expect(sceneOwnAudio(off)).toBe("off");
    const on = setSceneAudioMuted(off, false);
    expect(JSON.parse(on!)).toEqual({ ambient: { url: "media:a" } });
    expect(setSceneAudioMuted(JSON.stringify({ muted: true }), false)).toBeNull();
  });
});
