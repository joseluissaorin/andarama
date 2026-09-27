import { describe, expect, it } from "vitest";
import { attributionSchema, clickIdOf, collectConversions, conversionsCsv, CONVERSION_WINDOW_MS, type AttributionRow } from "./attribution.js";

const AHORA = Date.UTC(2026, 9, 20, 12, 0, 0);
const DIA = 24 * 3600 * 1000;

function usuario(parcial: Partial<AttributionRow>): AttributionRow {
  return {
    userId: "u",
    email: "x@y.z",
    plan: null,
    planOverride: null,
    createdAt: AHORA - 5 * DIA,
    planUpdatedAt: null,
    attributedAt: AHORA - 5 * DIA,
    attribution: null,
    ...parcial,
  };
}

describe("atribución: campos nuevos", () => {
  it("acepta gbraid, wbraid, utm_content, landing_web y consent", () => {
    const a = attributionSchema.parse({ wbraid: "w", gbraid: "g", utm_content: "456", landing_web: "/en/pricing/", consent: true });
    expect(a).toMatchObject({ wbraid: "w", gbraid: "g", consent: true });
    expect(() => attributionSchema.parse({ consent: "si" })).toThrow();
  });

  it("elige un solo identificador de clic, con el gclid delante", () => {
    expect(clickIdOf({ gclid: "a", wbraid: "b" })).toEqual({ gclid: "a" });
    expect(clickIdOf({ gbraid: "g", wbraid: "w" })).toEqual({ gbraid: "g" });
    expect(clickIdOf({ wbraid: "w" })).toEqual({ wbraid: "w" });
    expect(clickIdOf({ utm_source: "google" })).toBeNull();
  });
});

describe("conversiones para Google Ads", () => {
  it("prueba, pago y demo de los últimos noventa días, con el consentimiento de cada uno", () => {
    const lista = collectConversions({
      now: AHORA,
      users: [
        // Aceptó el aviso y pagó Paseo
        usuario({
          userId: "ana",
          plan: "paseo",
          planUpdatedAt: AHORA - 2 * DIA,
          attribution: { gclid: "G-ANA", consent: true, touchedAt: AHORA - 6 * DIA },
        }),
        // Atribución antigua sin respuesta al aviso: se declara denegado
        usuario({ userId: "bea", attribution: { wbraid: "W-BEA" } }),
        // Sin identificador de clic: nada
        usuario({ userId: "carla", attribution: { utm_source: "google", consent: false } }),
        // Plan concedido a mano: es prueba, no pago
        usuario({ userId: "dani", planOverride: "vitalicio", planUpdatedAt: AHORA - DIA, attribution: { gclid: "G-DANI", consent: true } }),
        // Demasiado antigua
        usuario({ userId: "eva", createdAt: AHORA - CONVERSION_WINDOW_MS - DIA, attribution: { gclid: "G-EVA", consent: true } }),
        // El clic es posterior al alta: no causó la prueba
        usuario({ userId: "fede", attribution: { gclid: "G-FEDE", consent: true, touchedAt: AHORA - DIA } }),
      ],
      demos: [
        { createdAt: AHORA - 3 * DIA, adConsent: true, attribution: { gbraid: "GB-1", consent: true } },
        { createdAt: AHORA - 3 * DIA, adConsent: false, attribution: { utm_source: "google", consent: false } },
      ],
    });
    const resumen = lista.map((c) => `${c.name}:${c.click.gclid ?? c.click.gbraid ?? c.click.wbraid}:${c.consent}`);
    expect(resumen.sort()).toEqual(
      [
        "Pago:G-ANA:true",
        "Prueba iniciada:G-ANA:true",
        "Prueba iniciada:W-BEA:false",
        "Prueba iniciada:G-DANI:true",
        "Solicitud de demo:GB-1:true",
      ].sort(),
    );
    const pago = lista.find((c) => c.name === "Pago")!;
    expect(pago).toMatchObject({ value: 20, currency: "USD" });
    expect(lista.find((c) => c.name === "Solicitud de demo")).toMatchObject({ value: 60, currency: "EUR" });
    expect(lista.find((c) => c.name === "Prueba iniciada")).toMatchObject({ value: 10, currency: "EUR" });
  });

  it("escribe el CSV de importación de clics de Google", () => {
    const csv = conversionsCsv([
      { name: "Prueba iniciada", time: Date.UTC(2026, 9, 1, 8, 30, 5), value: 10, currency: "EUR", click: { gclid: "G1" }, consent: true },
      { name: "Solicitud de demo", time: Date.UTC(2026, 9, 2), value: 60, currency: "EUR", click: { wbraid: "W1" }, consent: false },
    ]);
    const lineas = csv.trim().split("\r\n");
    expect(lineas[0]).toBe(
      "Google Click ID,GBRAID,WBRAID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Ad User Data,Ad Personalization",
    );
    expect(lineas[1]).toBe("G1,,,Prueba iniciada,2026-10-01 08:30:05+00:00,10,EUR,GRANTED,GRANTED");
    expect(lineas[2]).toBe(",,W1,Solicitud de demo,2026-10-02 00:00:00+00:00,60,EUR,DENIED,DENIED");
  });
});
