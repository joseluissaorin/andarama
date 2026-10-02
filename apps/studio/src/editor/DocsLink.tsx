import { BookOpen } from "lucide-react";
import { useT } from "../i18n";

export const DOCS_BASE = "https://docs.andarama.com";

/**
 * Páginas de la documentación a las que se enlaza desde el editor. Las rutas
 * salen de apps/docs/src/content/docs/ (usuario/ y referencia/) (Starlight: una página por
 * fichero, anclas por título de sección).
 */
export const DOCS_PAGES = {
  quiz: "usuario/docencia/#quiz",
  treasure: "usuario/docencia/#búsqueda-del-tesoro",
  state: "usuario/variables/",
  conditions: "usuario/variables/#las-condiciones",
  escapeRoom: "usuario/escape-room/",
  polygon: "usuario/variables/#el-hotspot-polígono",
  form: "referencia/widgets/#didácticos",
  floorplan: "usuario/grafo/#modo-plano",
} as const;

export function docsUrl(page: keyof typeof DOCS_PAGES): string {
  return `${DOCS_BASE}/${DOCS_PAGES[page]}`;
}

/** «¿Cómo se hace?»: enlace pequeño a la guía, en una pestaña nueva. */
export function DocsLink({ page, className = "" }: { page: keyof typeof DOCS_PAGES; className?: string }): React.ReactNode {
  const t = useT();
  return (
    <a
      href={docsUrl(page)}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 text-[12px] font-medium text-[var(--anda-primary-ink)] hover:underline ${className}`}
    >
      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
      {t("docs_how_to")}
    </a>
  );
}
