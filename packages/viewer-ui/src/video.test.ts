import { describe, expect, it } from "vitest";
import { parseVideoRef } from "./video.js";

describe("parseVideoRef", () => {
  it("saca el ID de YouTube de cualquier forma de la dirección", () => {
    const id = "5PAIFUrQYOs";
    for (const url of [
      "https://youtu.be/5PAIFUrQYOs?si=BmxpoV3sN_m3gGvi",
      "https://www.youtube.com/watch?v=5PAIFUrQYOs",
      "https://www.youtube.com/watch?feature=share&v=5PAIFUrQYOs",
      "https://m.youtube.com/watch?v=5PAIFUrQYOs",
      "https://www.youtube.com/shorts/5PAIFUrQYOs",
      "https://www.youtube-nocookie.com/embed/5PAIFUrQYOs",
      "https://www.youtube.com/live/5PAIFUrQYOs",
      "youtu.be/5PAIFUrQYOs",
      "5PAIFUrQYOs",
    ]) {
      expect(parseVideoRef("youtube", url)?.id, url).toBe(id);
    }
  });

  it("respeta el segundo de inicio de la dirección", () => {
    expect(parseVideoRef("youtube", "https://youtu.be/5PAIFUrQYOs?t=90")).toEqual({ id: "5PAIFUrQYOs", start: 90 });
    expect(parseVideoRef("youtube", "https://www.youtube.com/watch?v=5PAIFUrQYOs&t=1m30s")).toEqual({ id: "5PAIFUrQYOs", start: 90 });
  });

  it("rechaza lo que no es un vídeo", () => {
    expect(parseVideoRef("youtube", "")).toBeNull();
    expect(parseVideoRef("youtube", "https://example.com/watch?v=abc")).toBeNull();
    expect(parseVideoRef("youtube", "hola mundo")).toBeNull();
  });

  it("entiende Vimeo", () => {
    expect(parseVideoRef("vimeo", "https://vimeo.com/76979871")?.id).toBe("76979871");
    expect(parseVideoRef("vimeo", "https://player.vimeo.com/video/76979871?h=abc")?.id).toBe("76979871");
    expect(parseVideoRef("vimeo", "76979871")?.id).toBe("76979871");
  });
});
