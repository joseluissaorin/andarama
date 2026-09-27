import { describe, expect, it } from "vitest";
import { rememberFormSent, visitorId, wasFormSent, type KeyValueStore } from "./visitor.js";

function memoria(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("memoria del visitante", () => {
  it("el identificador es estable en el mismo navegador", () => {
    const st = memoria();
    const a = visitorId(st);
    expect(a).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(visitorId(st)).toBe(a);
  });

  it("un identificador guardado con otra forma se sustituye", () => {
    const st = memoria();
    st.setItem("andarama.visitor", "<script>");
    expect(visitorId(st)).not.toBe("<script>");
  });

  it("recuerda los formularios enviados, uno a uno", () => {
    const st = memoria();
    expect(wasFormSent("f1", st)).toBe(false);
    rememberFormSent("f1", st);
    expect(wasFormSent("f1", st)).toBe(true);
    expect(wasFormSent("f2", st)).toBe(false);
  });

  it("sin almacenamiento no falla", () => {
    expect(visitorId(null)).toMatch(/.{8,}/);
    expect(wasFormSent("f1", null)).toBe(false);
    expect(() => rememberFormSent("f1", null)).not.toThrow();
  });

  it("un almacenamiento que lanza (modo privado) no rompe el visor", () => {
    const roto: KeyValueStore = {
      getItem: () => {
        throw new Error("denegado");
      },
      setItem: () => {
        throw new Error("denegado");
      },
    };
    expect(visitorId(roto)).toMatch(/.{8,}/);
    expect(wasFormSent("f1", roto)).toBe(false);
    expect(() => rememberFormSent("f1", roto)).not.toThrow();
  });
});
