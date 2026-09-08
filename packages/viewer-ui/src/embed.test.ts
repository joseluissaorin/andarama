import { describe, expect, it } from "vitest";
import { embedFileName, embedSource } from "./embed.js";

const SKETCHFAB =
  '<div class="sketchfab-embed-wrapper"> <iframe title="Modelo" frameborder="0" allowfullscreen mozallowfullscreen="true" webkitallowfullscreen="true" allow="autoplay; fullscreen; xr-spatial-tracking" xr-spatial-tracking execution-while-out-of-viewport execution-while-not-rendered web-share width="640" height="480" src="https://sketchfab.com/models/abc123/embed"> </iframe> </div>';

describe("embedSource", () => {
  it("reconoce el iframe único de Sketchfab y se queda con su fuente", () => {
    const src = embedSource(SKETCHFAB);
    expect(src?.src).toBe("https://sketchfab.com/models/abc123/embed");
    expect(src?.allowFullscreen).toBe(true);
    expect(src?.allow).toContain("xr-spatial-tracking");
    expect(src?.aspect).toBeCloseTo(640 / 480, 3);
  });

  it("acepta el iframe de Google Maps y el de YouTube", () => {
    expect(
      embedSource('<iframe src="https://www.google.com/maps/embed?pb=!1m18" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>')?.src,
    ).toBe("https://www.google.com/maps/embed?pb=!1m18");
    expect(embedSource('<iframe width="560" height="315" src="https://www.youtube.com/embed/x" title="YouTube" frameborder="0" allowfullscreen></iframe>')?.aspect).toBeCloseTo(16 / 9, 2);
  });

  it("un código con scripts o varios elementos necesita el documento aparte", () => {
    expect(embedSource('<blockquote class="twitter-tweet"><p>hola</p></blockquote><script async src="https://platform.twitter.com/widgets.js"></script>')).toBeNull();
    expect(embedSource('<iframe src="https://a.example/x"></iframe><script>alert(1)</script>')).toBeNull();
    expect(embedSource('<iframe src="https://a.example/x"></iframe><iframe src="https://a.example/y"></iframe>')).toBeNull();
  });

  it("no acepta fuentes que no sean http(s)", () => {
    expect(embedSource('<iframe src="javascript:alert(1)"></iframe>')).toBeNull();
    expect(embedSource("")).toBeNull();
  });

  it("el documento aparte se llama por el id del hotspot", () => {
    expect(embedFileName("h1")).toBe("embed/h1.html");
  });
});
