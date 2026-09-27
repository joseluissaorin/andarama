/**
 * Datos del titular de andarama.com (artículo 10 de la LSSI): salen en el
 * aviso legal, las condiciones, la privacidad y la página de contratación.
 * Es el único sitio donde se escriben: para cambiar el domicilio (por
 * ejemplo, a uno profesional), basta con tocar esta constante y reconstruir.
 */
import { pagePath, type Lang, type PageKey } from "../i18n";

export const TITULAR = {
  nombre: "José Luis Saorín Ferrer",
  nif: "79081262V",
  domicilio: "Calle Prolongación Ramón y Cajal, 1C, 3B, 38003 Santa Cruz de Tenerife",
  correo: "jl@joseluissaorin.com",
  /** Proveedor de los correos transaccionales, tal como se nombra en la privacidad. */
  proveedorCorreo: "Resend, Inc.",
} as const;

/** Páginas que los textos legales y de confianza pueden enlazar con `{clave}`. */
const PAGINAS_ENLAZABLES: Partial<Record<string, PageKey>> = {
  precios: "precios",
  privacidad: "privacidad",
  aviso_legal: "avisoLegal",
  condiciones: "condiciones",
  seguridad: "seguridad",
  accesibilidad: "accesibilidad",
  codigo_abierto: "codigoAbierto",
  contratacion: "contratacion",
  universidades: "universidades",
  formacion: "formacion",
  museos: "museos",
  aula: "aula",
  inmobiliaria: "inmobiliaria",
};

/**
 * Sustituye los marcadores de un texto (`{titular}`, `{nif}`, `{domicilio}`,
 * `{correo}`, `{proveedor_correo}` y las rutas de página como `{precios}`)
 * por su valor en el idioma pedido. Los marcadores desconocidos se dejan tal
 * cual, para que canten en pantalla.
 */
export function conMarcadores(lang: Lang, texto: string, extra: Record<string, string> = {}): string {
  const datos: Record<string, string> = {
    titular: TITULAR.nombre,
    nif: TITULAR.nif,
    domicilio: TITULAR.domicilio,
    correo: TITULAR.correo,
    proveedor_correo: TITULAR.proveedorCorreo,
    ...extra,
  };
  return texto.replace(/\{(\w+)\}/g, (m, clave: string) => {
    if (datos[clave] != null) return datos[clave]!;
    const pagina = PAGINAS_ENLAZABLES[clave];
    return pagina != null ? pagePath(lang, pagina) : m;
  });
}
