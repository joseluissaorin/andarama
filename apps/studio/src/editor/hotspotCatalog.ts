/**
 * Catálogo de los 17 tipos de hotspot: nombre corriente, para qué sirve y a
 * qué familia pertenece.
 *
 * Antes eran diecisiete botones en una rejilla de dos columnas dentro de un
 * panel de 320 px, al final del formulario de la escena: los rótulos se salían
 * y había que recorrer todo el formulario para añadir nada. Ahora esto
 * alimenta una paleta buscable, y de paso da a cada tipo una descripción, que
 * es lo que de verdad ayuda a elegir.
 */

export type HotspotFamily = "navigation" | "content" | "media" | "learning";

export interface HotspotKind {
  type: string;
  family: HotspotFamily;
  /** Icono de la biblioteca lucide (se resuelve en la vista). */
  icon: string;
  /** Palabras por las que un autor lo buscaría, además del nombre. */
  keywords: string[];
}

export const HOTSPOT_CATALOG: HotspotKind[] = [
  { type: "navigation", family: "navigation", icon: "move-right", keywords: ["ir", "pasar", "puerta", "escena", "salto", "go", "door"] },
  { type: "link", family: "navigation", icon: "link", keywords: ["url", "enlace", "web", "correo", "telefono", "mail"] },
  { type: "state", family: "navigation", icon: "toggle-left", keywords: ["variable", "estado", "contador", "logica", "condicion"] },
  { type: "polygon", family: "navigation", icon: "pentagon", keywords: ["zona", "area", "region", "contorno", "mascara"] },

  { type: "text", family: "content", icon: "align-left", keywords: ["texto", "markdown", "panel", "cartela", "descripcion"] },
  { type: "tooltip", family: "content", icon: "message-square", keywords: ["burbuja", "nota", "aviso", "etiqueta"] },
  { type: "image", family: "content", icon: "image", keywords: ["foto", "imagen", "cuadro", "zoom", "lightbox"] },
  { type: "gallery", family: "content", icon: "images", keywords: ["galeria", "carrusel", "fotos", "album"] },
  { type: "pdf", family: "content", icon: "file-text", keywords: ["documento", "pdf", "folleto", "plano"] },
  { type: "web", family: "content", icon: "globe", keywords: ["iframe", "web", "pagina", "incrustar"] },

  { type: "videoFile", family: "media", icon: "film", keywords: ["video", "pelicula", "mp4", "proyeccion", "pantalla"] },
  { type: "embedVideo", family: "media", icon: "youtube", keywords: ["youtube", "vimeo", "peertube", "video"] },
  { type: "audio", family: "media", icon: "volume-2", keywords: ["sonido", "audio", "narracion", "espacial", "voz"] },
  { type: "model3d", family: "media", icon: "box", keywords: ["3d", "modelo", "glb", "gltf", "obj", "stl", "ar"] },

  { type: "quiz", family: "learning", icon: "help-circle", keywords: ["pregunta", "test", "examen", "puntos", "quiz"] },
  { type: "form", family: "learning", icon: "clipboard-list", keywords: ["formulario", "encuesta", "contacto", "campos"] },
  { type: "compare", family: "learning", icon: "columns-2", keywords: ["comparador", "antes", "despues", "deslizador"] },
  { type: "treasure", family: "learning", icon: "gem", keywords: ["tesoro", "busqueda", "juego", "gymkana", "escondido", "premio"] },
];

export const FAMILY_ORDER: HotspotFamily[] = ["navigation", "content", "media", "learning"];

/**
 * Filtra el catálogo por texto. Compara sin tildes para que «navegacion»
 * encuentre «Navegación»: quien busca deprisa no escribe los acentos.
 */
export function searchCatalog(query: string, labelOf: (type: string) => string): HotspotKind[] {
  const q = fold(query.trim());
  if (q === "") return HOTSPOT_CATALOG;
  return HOTSPOT_CATALOG.filter((k) => {
    if (fold(labelOf(k.type)).includes(q)) return true;
    if (fold(k.type).includes(q)) return true;
    return k.keywords.some((w) => fold(w).includes(q));
  });
}

export function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
