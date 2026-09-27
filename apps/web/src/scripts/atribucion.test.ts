import { describe, expect, it } from "vitest";
import {
  CLAVE_ALMACEN,
  construir,
  decorarHref,
  guardarAtribucion,
  leerAtribucion,
  parametrosDeUrl,
  parametrosParaApp,
  traeAnuncio,
} from "./atribucion";

function memoria(): Pick<Storage, "getItem" | "setItem"> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("atribución de anuncios en la web", () => {
  const url = "?gclid=Cj0abc&wbraid=w1&utm_source=google&utm_medium=cpc&utm_campaign=123&utm_term=tour%20virtual&utm_content=456&otra=x";

  it("lee identificadores de clic y utm, e ignora lo demás", () => {
    const p = parametrosDeUrl(url);
    expect(p.clic).toEqual({ gclid: "Cj0abc", wbraid: "w1" });
    expect(p.utm).toEqual({ utm_source: "google", utm_medium: "cpc", utm_campaign: "123", utm_term: "tour virtual", utm_content: "456" });
    expect(traeAnuncio(p)).toBe(true);
    expect(traeAnuncio(parametrosDeUrl("?ref=algo"))).toBe(false);
    expect(traeAnuncio(parametrosDeUrl("?utm_source=boletin"))).toBe(true);
  });

  it("con «Sí» guarda el clic y el consentimiento; con «No», solo las utm", () => {
    const p = parametrosDeUrl(url);
    const si = construir(p, "si", "/en/pricing/");
    expect(si).toMatchObject({ gclid: "Cj0abc", wbraid: "w1", utm_source: "google", landing_web: "/en/pricing/", consent: true });
    const no = construir(p, "no", "/en/pricing/");
    expect(no.gclid).toBeUndefined();
    expect(no.wbraid).toBeUndefined();
    expect(no).toMatchObject({ utm_source: "google", utm_content: "456", landing_web: "/en/pricing/", consent: false });
    const pendiente = construir(p, null, "/");
    expect(pendiente.gclid).toBeUndefined();
    expect(pendiente.consent).toBeUndefined();
  });

  it("añade los parámetros solo a los enlaces del Studio y sin pisar los suyos", () => {
    const params = parametrosParaApp(construir(parametrosDeUrl(url), "si", "/precios/"));
    expect(params).toMatchObject({ gclid: "Cj0abc", consent: "1", landing_web: "/precios/" });
    const app = new URL(decorarHref("https://app.andarama.com/plan?plan=paseo", params));
    expect(app.searchParams.get("plan")).toBe("paseo");
    expect(app.searchParams.get("gclid")).toBe("Cj0abc");
    expect(app.searchParams.get("utm_term")).toBe("tour virtual");
    expect(decorarHref("https://docs.andarama.com/", params)).toBe("https://docs.andarama.com/");
    expect(decorarHref("/precios/", params)).toBe("/precios/");
    const conNo = parametrosParaApp(construir(parametrosDeUrl(url), "no", "/"));
    expect(conNo.consent).toBe("0");
    expect(conNo.gclid).toBeUndefined();
  });

  it("guarda y lee de la sesión", () => {
    const s = memoria();
    expect(leerAtribucion(s)).toBeNull();
    guardarAtribucion(s, { utm_source: "google", consent: false });
    expect(s.data.has(CLAVE_ALMACEN)).toBe(true);
    expect(leerAtribucion(s)).toEqual({ utm_source: "google", consent: false });
  });
});
