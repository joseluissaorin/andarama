import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AudioEngine, globalMusicLevel, sceneReplacesGlobal } from "./audio";

/**
 * La música de fondo del tour y el ambiente de cada escena sonaban a la vez.
 * Ahora la música cede (fundido a silencio) en las escenas con sonido propio
 * y vuelve al salir de ellas.
 */

// Web Audio y <audio> mínimos: lo que importa es a qué nivel queda la
// ganancia de la música global.
class FakeParam {
  value = 1;
  target: number | null = null;
  setTargetAtTime(v: number): void {
    this.target = v;
  }
  cancelScheduledValues(): void {}
}
class FakeNode {
  gain = new FakeParam();
  connect(): void {}
  disconnect(): void {}
}
class FakeContext {
  currentTime = 0;
  state = "running";
  destination = {};
  listener = {};
  createGain(): FakeNode {
    return new FakeNode();
  }
  createMediaElementSource(): FakeNode {
    return new FakeNode();
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}
class FakeAudio {
  volume = 1;
  loop = false;
  muted = false;
  paused = true;
  crossOrigin: string | null = null;
  onended: (() => void) | null = null;
  constructor(public src: string) {}
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

const g = globalThis as Record<string, unknown>;
const saved = { AudioContext: g.AudioContext, Audio: g.Audio, raf: g.requestAnimationFrame };
beforeAll(() => {
  g.AudioContext = FakeContext;
  g.Audio = FakeAudio;
  g.requestAnimationFrame = () => 0;
});
afterAll(() => {
  g.AudioContext = saved.AudioContext;
  g.Audio = saved.Audio;
  g.requestAnimationFrame = saved.raf;
});

function nivel(engine: AudioEngine): number {
  const p = (engine as unknown as { globalGain: FakeNode }).globalGain.gain;
  return p.target ?? p.value;
}

function nuevo(): AudioEngine {
  return new AudioEngine("", (_b, u) => u, () => "es");
}

describe("música global que cede al sonido de la escena", () => {
  it("por defecto cede cuando la escena tiene ambiente o fuentes espaciales", () => {
    expect(sceneReplacesGlobal(undefined)).toBe(false);
    expect(sceneReplacesGlobal({})).toBe(false);
    expect(sceneReplacesGlobal({ ambient: { url: "a.mp3" } })).toBe(true);
    expect(sceneReplacesGlobal({ spatial: [{ id: "s", url: "s.mp3", yaw: 0, pitch: 0 }] })).toBe(true);
    // Una narración sola no la calla: ya la baja el ducking
    expect(sceneReplacesGlobal({ narration: { url: "n.mp3" } })).toBe(false);
  });

  it("replaceGlobal manda en los dos sentidos", () => {
    expect(sceneReplacesGlobal({ ambient: { url: "a.mp3" }, replaceGlobal: false })).toBe(false);
    expect(sceneReplacesGlobal({ replaceGlobal: true })).toBe(true);
  });

  it("el nivel combina ducking y cesión", () => {
    expect(globalMusicLevel(1, 1)).toBe(1);
    expect(globalMusicLevel(0.15, 1)).toBeCloseTo(0.15);
    expect(globalMusicLevel(1, 0)).toBe(0);
  });

  it("se funde al entrar en una escena con ambiente y vuelve al salir", () => {
    const engine = nuevo();
    // Escena inicial con ambiente: el visor pone la escena antes que la música
    engine.setSceneAudio({ ambient: { url: "mar.mp3" } });
    engine.setGlobalMusic({ url: "musica.mp3" });
    expect(nivel(engine)).toBe(0);

    engine.setSceneAudio(undefined);
    expect(nivel(engine)).toBe(1);

    engine.setSceneAudio({ ambient: { url: "mar.mp3" }, replaceGlobal: false });
    expect(nivel(engine)).toBe(1);

    engine.setSceneAudio({ ambient: { url: "mar.mp3" } });
    expect(nivel(engine)).toBe(0);
    engine.destroy();
  });

  it("la música va por el graph de Web Audio desde la primera llamada", () => {
    const engine = nuevo();
    engine.setGlobalMusic({ url: "musica.mp3", volume: 0.4 });
    expect((engine as unknown as { globalRouted: boolean }).globalRouted).toBe(true);
    engine.destroy();
  });
});
