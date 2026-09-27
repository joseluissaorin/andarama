import { describe, expect, it } from "vitest";
import { mimeAllowedForKind, sniffModel } from "./helpers.js";

/**
 * El hotspot de modelo 3D admitía STL y OBJ en el Studio y en el visor, pero
 * el servidor solo reconocía GLB y borraba la subida.
 */
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

function stlBinario(triangles: number, cabecera = "exportado"): Uint8Array {
  const bytes = new Uint8Array(84 + triangles * 50);
  bytes.set(enc(cabecera).slice(0, 80));
  new DataView(bytes.buffer).setUint32(80, triangles, true);
  return bytes;
}

describe("sniffModel", () => {
  it("reconoce el STL binario por su tamaño, aunque la cabecera diga «solid»", () => {
    expect(sniffModel(stlBinario(3))).toBe("model/stl");
    expect(sniffModel(stlBinario(2, "solid pieza"))).toBe("model/stl");
  });

  it("reconoce el STL de texto", () => {
    expect(sniffModel(enc("solid cubo\n facet normal 0 0 1\n outer loop\n vertex 0 0 0\n endloop\n endfacet\nendsolid cubo\n"))).toBe("model/stl");
  });

  it("reconoce GLB, glTF, OBJ y USDZ", () => {
    expect(sniffModel(enc("glTF\u0002\u0000\u0000\u0000"))).toBe("model/gltf-binary");
    expect(sniffModel(enc('{"asset":{"version":"2.0"},"scenes":[]}'))).toBe("model/gltf+json");
    expect(sniffModel(enc("# Blender\nmtllib a.mtl\no Cubo\nv 1.0 1.0 -1.0\nv 1.0 -1.0 -1.0\nf 1 2 3\n"))).toBe("model/obj");
    expect(sniffModel(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]))).toBe("model/vnd.usdz+zip");
  });

  it("rechaza lo que no es un modelo", () => {
    expect(sniffModel(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2]))).toBeNull();
    expect(sniffModel(enc("<html><body>hola</body></html>"))).toBeNull();
    expect(mimeAllowedForKind("model", sniffModel(stlBinario(1)))).toBe(true);
    expect(mimeAllowedForKind("model", null)).toBe(false);
  });
});
