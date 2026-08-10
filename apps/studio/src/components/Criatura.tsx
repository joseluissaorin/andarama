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
