import { describe, expect, it } from "vitest";
import { publishedSceneAudio } from "./compiler.js";

describe("audio de la escena al publicar", () => {
  const ambiente = { url: "media:amb", volume: 0.8 };
  const narracion = { url: "media:voz", blockNavigation: true };

  it("sin desactivar, se publica tal cual", () => {
    expect(publishedSceneAudio(JSON.stringify({ ambient: ambiente, narration: narracion }))).toEqual({ ambient: ambiente, narration: narracion });
  });

  it("desactivado desde el Studio, no se publica ni el ambiente ni la narración", () => {
    expect(publishedSceneAudio(JSON.stringify({ ambient: ambiente, narration: narracion, muted: true }))).toBeUndefined();
  });

  it("desactivado, sigue callando la música del tour si así se pidió", () => {
    expect(publishedSceneAudio(JSON.stringify({ ambient: ambiente, muted: true, replaceGlobal: true }))).toEqual({ replaceGlobal: true });
  });

  it("la marca muted: false no llega al tour.json", () => {
    expect(publishedSceneAudio(JSON.stringify({ ambient: ambiente, muted: false }))).toEqual({ ambient: ambiente });
    expect(publishedSceneAudio(JSON.stringify({ muted: false }))).toBeUndefined();
  });

  it("sin audio o con JSON roto, nada", () => {
    expect(publishedSceneAudio(null)).toBeUndefined();
    expect(publishedSceneAudio("{roto")).toBeUndefined();
  });
});
