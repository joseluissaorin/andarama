import { describe, expect, it } from "vitest";
import { mediaDragPayload, sceneTypeForMedia, scenesFromMedia } from "./drag";
import type { MediaItem } from "../pages/MediaPage";

const media = (over: Partial<MediaItem>): MediaItem => ({
  id: "m1",
  kind: "image",
  filename: "foto.jpg",
  mime: "image/jpeg",
  folder: null,
  projectId: null,
  bytes: 1,
  width: null,
  height: null,
  duration: null,
  status: "ready",
  createdAt: 0,
  exif: null,
  derivatives: [],
  ...over,
});

describe("escenas desde medios arrastrados", () => {
  it("una imagen que no es 2:1 sale como escena plana, un panorama como 360", () => {
    const draft = { scenes: [], settings: {} };
    const plano = mediaDragPayload(media({ id: "a", width: 8000, height: 6000, derivatives: [{ kind: "tiles", manifest: {} }] }));
    const pano = mediaDragPayload(media({ id: "b", kind: "panorama", width: 8000, height: 4000 }));
    const { created } = scenesFromMedia(draft, "p", [plano, pano]);
    expect(created).toHaveLength(2);
    expect(draft.scenes.map((s: { type: string }) => s.type)).toEqual(["flat", "image"]);
  });

  it("soltar otra vez el mismo medio no duplica la escena", () => {
    const draft = { scenes: [], settings: {} };
    const item = mediaDragPayload(media({ kind: "panorama", width: 4000, height: 2000 }));
    const primera = scenesFromMedia(draft, "p", [item]);
    const segunda = scenesFromMedia(draft, "p", [item]);
    expect(draft.scenes).toHaveLength(1);
    expect(segunda.created).toEqual([]);
    expect(segunda.reused).toEqual(primera.created);
  });
});

describe("«Nueva escena» elige el tipo por el medio", () => {
  it("una foto plana sale como escena plana, no como panorama estirado", () => {
    expect(sceneTypeForMedia(media({ width: 4000, height: 3000 }))).toBe("flat");
    expect(sceneTypeForMedia(media({ width: 8000, height: 4000 }))).toBe("image");
    expect(sceneTypeForMedia(media({ kind: "panorama" }))).toBe("image");
    expect(sceneTypeForMedia(media({ kind: "video" }))).toBe("video");
  });
});
