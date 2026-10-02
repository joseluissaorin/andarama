import { describe, expect, it } from "vitest";
import { DEFAULT_ICON_BY_TYPE, hasIcon } from "./icons";

describe("iconos por defecto", () => {
  it("el hotspot de estado/contador usa el mismo icono que la paleta del Studio", () => {
    // apps/studio/src/editor/hotspotCatalog.ts: { type: "state", icon: "toggle-left" }
    expect(DEFAULT_ICON_BY_TYPE.state).toBe("toggle-left");
    expect(hasIcon("toggle-left")).toBe(true);
  });

  it("todos los iconos por defecto existen en el registro", () => {
    for (const name of Object.values(DEFAULT_ICON_BY_TYPE)) expect(hasIcon(name), name).toBe(true);
  });
});
