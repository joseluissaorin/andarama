import { describe, expect, it } from "vitest";
import { allowedProjections } from "./projections.js";

describe("proyecciones permitidas (ui.projections)", () => {
  it("sin ajuste se ofrecen todas", () => {
    expect(allowedProjections(undefined)).toHaveLength(5);
    expect(allowedProjections(true)).toHaveLength(5);
  });

  it("false quita el selector", () => {
    expect(allowedProjections(false)).toEqual([]);
  });

  it("una lista deja solo esas, con la normal para poder volver", () => {
    expect(allowedProjections(["littlePlanet"])).toEqual(["rectilinear", "littlePlanet"]);
    expect(allowedProjections(["pannini", "rectilinear"])).toEqual(["rectilinear", "pannini"]);
  });

  it("solo la normal: no hay nada que elegir", () => {
    expect(allowedProjections(["rectilinear"])).toEqual(["rectilinear"]);
  });

  it("valores desconocidos se ignoran", () => {
    expect(allowedProjections(["nada" as never])).toEqual([]);
  });
});
