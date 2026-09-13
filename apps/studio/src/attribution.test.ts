import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_STORAGE_KEY,
  ATTRIBUTION_TTL_MS,
  attributionFromUrl,
  captureAttribution,
  clearAttribution,
  pendingAttribution,
} from "./attribution";

/** localStorage de mentira para las pruebas. */
function memoria(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("atribución publicitaria", () => {
  it("lee gclid, msclkid y utm_* de la URL e ignora lo demás", () => {
    expect(attributionFromUrl("https://app.andarama.com/register?gclid=abc&utm_source=google&utm_medium=cpc&foo=bar")).toEqual({
      gclid: "abc",
      utm_source: "google",
      utm_medium: "cpc",
    });
    expect(attributionFromUrl("https://app.andarama.com/")).toEqual({});
    expect(attributionFromUrl("no es una url")).toEqual({});
  });

  it("guarda el primer toque y no lo pisa con uno posterior", () => {
    const storage = memoria();
    let ahora = 1_700_000_000_000;
    const now = (): number => ahora;
    const primera = captureAttribution({ href: "https://app.andarama.com/register?gclid=uno&utm_campaign=lanzamiento", referrer: "", storage, now });
    expect(primera).toMatchObject({ gclid: "uno", utm_campaign: "lanzamiento", landing: "/register", touchedAt: ahora });
    expect(storage.data.has(ATTRIBUTION_STORAGE_KEY)).toBe(true);

    ahora += 3600_000;
    const segunda = captureAttribution({ href: "https://app.andarama.com/?msclkid=dos", referrer: "", storage, now });
    expect(segunda?.gclid).toBe("uno");
    expect(segunda?.msclkid).toBeUndefined();
    expect(pendingAttribution({ storage, now })?.gclid).toBe("uno");
  });

  it("toma los parámetros del referente si el Studio llega limpio desde la landing", () => {
    const storage = memoria();
    const a = captureAttribution({
      href: "https://app.andarama.com/register",
      referrer: "https://andarama.com/?utm_source=bing&msclkid=xyz",
      storage,
    });
    expect(a).toMatchObject({ msclkid: "xyz", utm_source: "bing", referrer: "andarama.com" });
  });

  it("sin parámetros no guarda nada, y caduca a los noventa días", () => {
    const storage = memoria();
    expect(captureAttribution({ href: "https://app.andarama.com/", referrer: "https://andarama.com/", storage })).toBeNull();
    expect(storage.data.size).toBe(0);

    let ahora = 1_700_000_000_000;
    const now = (): number => ahora;
    captureAttribution({ href: "https://app.andarama.com/?gclid=viejo", referrer: "", storage, now });
    ahora += ATTRIBUTION_TTL_MS + 1;
    expect(pendingAttribution({ storage, now })).toBeNull();
    expect(storage.data.size).toBe(0);
    // Y un toque nuevo tras caducar sí se guarda
    const nuevo = captureAttribution({ href: "https://app.andarama.com/?gclid=nuevo", referrer: "", storage, now });
    expect(nuevo?.gclid).toBe("nuevo");
    clearAttribution(storage);
    expect(pendingAttribution({ storage, now })).toBeNull();
  });
});
