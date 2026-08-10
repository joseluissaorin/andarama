import { useEffect, useState } from "react";
import andaCriatura from "../brand/anda-criatura.svg";

/**
 * La criatura de Andarama, lista para aparecer por los rincones del Studio.
 *
 * `andando` la deja botando en el sitio con el mismo brinco de la landing;
 * `paseo` la hace cruzar el ancho de su contenedor. Las dos respetan
 * `prefers-reduced-motion` (las reglas viven en index.css).
 */
export function Criatura({
  size = 64,
  andando = false,
  className = "",
}: {
  size?: number;
  andando?: boolean;
  className?: string;
}): React.ReactNode {
  return (
    <img
      src={andaCriatura}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`${andando ? "anda-brinca" : ""} ${className}`.trim()}
      style={{ display: "block" }}
    />
  );
}

/**
 * El cameo: cada mucho rato la criatura cruza la ventana por abajo y se va.
 *
 * Es un detalle humano, no un elemento de interfaz: no recibe clics, no la
 * anuncia el lector de pantalla, no aparece si el sistema pide menos
 * movimiento y espera a que la pestaña esté a la vista para no gastarse el
 * guiño con nadie delante. La gracia está en que sea raro: la primera vez
 * tarda un par de minutos y luego pasan entre cuatro y nueve.
 */
export function CriaturaCameo({ size = 44 }: { size?: number }): React.ReactNode {
  const [paseo, setPaseo] = useState<{ id: number; dur: number; vuelta: boolean } | null>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true) return;
    let vivo = true;
    let temporizador = 0;
    let contador = 0;
    const azar = (min: number, max: number): number => min + Math.random() * (max - min);
    const programar = (min: number, max: number): void => {
      temporizador = window.setTimeout(() => {
        if (!vivo) return;
        // Si nadie mira, se guarda el cameo para cuando vuelvan
        if (document.hidden) {
          programar(20_000, 45_000);
          return;
        }
        const dur = azar(13, 19);
        contador += 1;
        setPaseo({ id: contador, dur, vuelta: Math.random() < 0.35 });
        window.setTimeout(() => {
          if (vivo) setPaseo(null);
        }, dur * 1000 + 400);
        programar(240_000, 540_000);
      }, azar(min, max));
    };
    programar(80_000, 200_000);
    return () => {
      vivo = false;
      window.clearTimeout(temporizador);
    };
  }, []);

  if (paseo == null) return null;
  return (
    <div
      key={paseo.id}
      aria-hidden="true"
      className={`anda-cameo ${paseo.vuelta ? "anda-cameo--vuelta" : ""}`.trim()}
      style={{ ["--anda-cameo-dur" as string]: `${paseo.dur}s` }}
    >
      {/* Tres capas: el desplazamiento, el volteo y el brinco. Dos animaciones
          de transform sobre el mismo elemento se pisan en vez de sumarse. */}
      <span style={{ display: "block", transform: paseo.vuelta ? "scaleX(-1)" : undefined }}>
        <img src={andaCriatura} alt="" width={size} height={size} className="anda-brinca" style={{ display: "block" }} />
      </span>
    </div>
  );
}

/** La criatura cruzando su contenedor sobre una línea de suelo, como en la landing. */
export function CriaturaPaseo({ size = 56, className = "" }: { size?: number; className?: string }): React.ReactNode {
  return (
    <div className={`anda-paseo ${className}`.trim()} style={{ height: size + 18 }} aria-hidden="true">
      <div className="anda-paseo__suelo" />
      <div className="anda-paseo__anda">
        <img src={andaCriatura} alt="" width={size} height={size} className="anda-brinca" />
      </div>
    </div>
  );
}
