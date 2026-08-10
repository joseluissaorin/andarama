import { Criatura } from "./Criatura";

/**
 * Cabecera de sección del Studio.
 *
 * El mismo gesto que la portada y el acceso: naranja plano de risografía,
 * título enorme en tinta y la criatura paseando por su suelo. Sirve para que
 * todas las pantallas se reconozcan como Andarama sin repetir el marcado.
 */
export function Cabecera({ title, hint, right, criatura = true }: {
  title: string;
  hint?: string;
  /** Acciones o datos que van a la derecha del título. */
  right?: React.ReactNode;
  criatura?: boolean;
}): React.ReactNode {
  return (
    <div className="anda-enter mb-5 overflow-hidden rounded-3xl border-[3px] border-[var(--anda-text)] bg-[#ff8a00] px-6 py-5 shadow-[8px_8px_0_var(--anda-yellow)]">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] font-extrabold leading-none tracking-tight text-[#33260f]">{title}</h1>
          {hint != null && <p className="mt-1.5 text-[13.5px] font-semibold text-[#fff8ec]">{hint}</p>}
        </div>
        {right}
        {/* Brinco en el sitio, no paseo: en una franja estrecha la criatura
            pasaría más tiempo fuera del recuadro que dentro. */}
        {criatura && (
          <div className="hidden shrink-0 sm:block">
            <Criatura size={54} andando />
          </div>
        )}
      </div>
    </div>
  );
}
