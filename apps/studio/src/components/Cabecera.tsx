import { Criatura } from "./Criatura";

/**
 * Cabecera de sección del Studio.
 *
 * Deliberadamente discreta: una banda con el mismo relieve que los botones
 * —degradado suave, filo de luz arriba, sombra corta— y el título en tinta.
 * El naranja a sangre y el borde de tinta se quedan para la portada y el
 * acceso; aquí competían con el contenido y partían la página en dos.
 */
export function Cabecera({ title, hint, right, criatura = true }: {
  title: string;
  hint?: string;
  /** Acciones o datos que van a la derecha del título. */
  right?: React.ReactNode;
  criatura?: boolean;
}): React.ReactNode {
  return (
    <div className="anda-cabecera anda-enter mb-5 px-5 py-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[23px] font-bold leading-tight tracking-tight text-[var(--anda-text)]">{title}</h1>
          {hint != null && <p className="mt-1 text-[13px] text-[var(--anda-text-dim)]">{hint}</p>}
        </div>
        {right}
        {criatura && (
          <div className="hidden shrink-0 opacity-90 sm:block">
            <Criatura size={40} andando />
          </div>
        )}
      </div>
    </div>
  );
}
