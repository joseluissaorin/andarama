import { describe, expect, it } from "vitest";
import { cameraQuaternion, forwardFromQuat, rotateAroundWorldY, upFromQuat, viewMatrixFromQuat, yawPitchFromQuat } from "./orientation.js";

/**
 * El modo cartón se veía invertido porque los ángulos del móvil se traducían a
 * yaw y pitch a mano, algo que solo se parece a la realidad con el teléfono
 * vertical y quieto. Estas pruebas fijan las posturas reales: de pie mirando al
 * horizonte, girado a horizontal —que es como se mete en unas gafas— y con la
 * cabeza vuelta hacia un lado.
 */

/** Teléfono en vertical, levantado, mirando al horizonte: beta 90. */
const DE_PIE = { alpha: 0, beta: 90, gamma: 0 };

const casi = (a: number, b: number, tol = 0.03): boolean => Math.abs(a - b) < tol;

describe("orientación del móvil para el modo cartón", () => {
  it("de pie y mirando al frente: la cámara mira al horizonte", () => {
    const { pitch } = yawPitchFromQuat(cameraQuaternion(DE_PIE.alpha, DE_PIE.beta, DE_PIE.gamma, 0));
    expect(Math.abs(pitch)).toBeLessThan(0.03);
  });

  it("inclinar el teléfono hacia abajo mira hacia abajo, no al revés", () => {
    const arriba = yawPitchFromQuat(cameraQuaternion(0, 120, 0, 0)).pitch;
    const abajo = yawPitchFromQuat(cameraQuaternion(0, 60, 0, 0)).pitch;
    expect(arriba).toBeGreaterThan(0.4);
    expect(abajo).toBeLessThan(-0.4);
  });

  it("girar sobre uno mismo cambia el rumbo y no el cabeceo", () => {
    const a = yawPitchFromQuat(cameraQuaternion(0, 90, 0, 0));
    const b = yawPitchFromQuat(cameraQuaternion(90, 90, 0, 0));
    expect(Math.abs(a.pitch - b.pitch)).toBeLessThan(0.05);
    expect(Math.abs(a.yaw - b.yaw)).toBeGreaterThan(1.2);
  });

  it("en vertical y de pie, la vertical de la cámara es la del mundo", () => {
    const up = upFromQuat(cameraQuaternion(0, 90, 0, 0));
    expect(up[1]).toBeGreaterThan(0.98);
  });

  it("compensar el giro de pantalla es exactamente balancear la imagen", () => {
    // Girar el teléfono a horizontal no debe cambiar hacia dónde se mira, solo
    // rodar la imagen los mismos grados que ha girado la pantalla. Sin esta
    // compensación la escena aparece tumbada, que es lo que se veía.
    const sin = cameraQuaternion(35, 70, -20, 0);
    const con = cameraQuaternion(35, 70, -20, 90);
    const fSin = forwardFromQuat(sin);
    const fCon = forwardFromQuat(con);
    for (let i = 0; i < 3; i++) expect(casi(fSin[i]!, fCon[i]!)).toBe(true);

    // La vertical gira 90 grados alrededor del eje de visión
    const uSin = upFromQuat(sin);
    const uCon = upFromQuat(con);
    const angulo = Math.acos(Math.max(-1, Math.min(1, uSin[0] * uCon[0] + uSin[1] * uCon[1] + uSin[2] * uCon[2])));
    expect(casi((angulo * 180) / Math.PI, 90, 0.5)).toBe(true);
  });

  it("el vector de avance es unitario en cualquier postura", () => {
    for (const [a, b, g, s] of [
      [0, 90, 0, 0],
      [45, 70, -30, 90],
      [200, 110, 40, -90],
    ]) {
      const f = forwardFromQuat(cameraQuaternion(a!, b!, g!, s!));
      expect(casi(Math.hypot(f[0], f[1], f[2]), 1)).toBe(true);
    }
  });

  it("la matriz de vista es la inversa de la rotación: lleva el avance a -Z", () => {
    const q = cameraQuaternion(37, 78, -12, 90);
    const m = viewMatrixFromQuat(q);
    const f = forwardFromQuat(q);
    // Aplicar la matriz (columna-mayor) al vector de avance
    const x = m[0]! * f[0] + m[4]! * f[1] + m[8]! * f[2];
    const y = m[1]! * f[0] + m[5]! * f[1] + m[9]! * f[2];
    const z = m[2]! * f[0] + m[6]! * f[1] + m[10]! * f[2];
    expect(casi(x, 0)).toBe(true);
    expect(casi(y, 0)).toBe(true);
    expect(casi(z, -1)).toBe(true);
  });
});

describe("fijar el rumbo al entrar", () => {
  it("girar sobre la vertical cambia el rumbo y respeta el cabeceo", () => {
    const q = cameraQuaternion(40, 75, -10, 0);
    const antes = yawPitchFromQuat(q);
    const girado = yawPitchFromQuat(rotateAroundWorldY(q, antes.yaw));
    // El rumbo queda a cero y el cabeceo intacto: así el cartón arranca
    // mirando donde estaba el visor plano.
    expect(Math.abs(girado.yaw)).toBeLessThan(1e-6);
    expect(casi(girado.pitch, antes.pitch)).toBe(true);
  });

  it("la vista y el rumbo corregido siguen siendo coherentes", () => {
    const q = rotateAroundWorldY(cameraQuaternion(120, 60, 25, 90), 0.8);
    const { yaw, pitch } = yawPitchFromQuat(q);
    const f = forwardFromQuat(q);
    // El vector de avance debe coincidir con el que produce yaw/pitch
    const d: [number, number, number] = [
      Math.cos(pitch) * Math.sin(yaw),
      Math.sin(pitch),
      -Math.cos(pitch) * Math.cos(yaw),
    ];
    for (let i = 0; i < 3; i++) expect(casi(f[i]!, d[i]!)).toBe(true);
  });
});
