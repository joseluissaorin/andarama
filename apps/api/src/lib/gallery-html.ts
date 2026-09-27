/**
 * Plantillas de la galería pública (/explorar/ y /explorar/{slug}/).
 *
 * Son páginas dinámicas (salen de la base de datos), así que las monta el
 * worker y no Astro; pero visten igual que el sitio: mismas hojas de estilo
 * (`/landing/estilo.css` y `/landing/sitio.css`, copiadas al construir),
 * misma cabecera y mismo pie. Sin JavaScript: todo lo que hay que ver está en
 * el HTML, que es lo que lee el buscador.
 */

export interface GalleryItem {
  slug: string;
  title: string;
  description: string;
  credits: string | null;
  placeName: string;
  placeCountry: string;
  countryName: string;
  lat: number | null;
  lng: number | null;
  lang: string;
  posterUrl: string;
  pageUrl: string;
  tourUrl: string;
  publishedAt: number;
}

export interface GalleryChrome {
  /** URL pública de la instancia, sin barra final. */
  base: string;
  /** Adónde lleva «Entrar al Studio» y «Crea el tuyo». */
  studioUrl: string;
}

// ---------------------------------------------------------------------------
// Textos del cromo. Los tours traen su idioma; el marco lo acompaña en los
// idiomas del sitio y cae al inglés (y al español) para el resto.
// ---------------------------------------------------------------------------

type Strings = Record<
  | "inicio"
  | "explorar"
  | "titulo_indice"
  | "titulo_pais"
  | "descripcion_indice"
  | "intro"
  | "por_pais"
  | "todos"
  | "vacio"
  | "anterior"
  | "siguiente"
  | "pagina"
  | "tour_360"
  | "tour_en"
  | "abrir_completo"
  | "visor_titulo"
  | "creditos"
  | "autor"
  | "hecho_con"
  | "hecho_texto"
  | "crea_el_tuyo"
  | "mas_recorridos"
  | "entrar"
  | "nav_editor"
  | "nav_visor"
  | "nav_precios"
  | "nav_documentacion"
  | "pie_linea"
  | "saltar",
  string
>;

const STRINGS: Record<string, Strings> = {
  es: {
    inicio: "Inicio",
    explorar: "Explorar",
    titulo_indice: "Explora recorridos virtuales 360",
    titulo_pais: "Recorridos virtuales 360 en {pais}",
    descripcion_indice:
      "Museos, monumentos, aulas, comercios y paisajes en recorridos virtuales 360 hechos con Andarama. Paséalos desde el navegador, también con gafas de realidad virtual.",
    intro:
      "Cada recorrido de esta galería lo ha publicado alguien con Andarama, el editor de tours 360 de código abierto. Se pasean desde cualquier navegador, sin instalar nada, y también con gafas de realidad virtual. Elige un lugar y entra.",
    por_pais: "Por país",
    todos: "Todos los países",
    vacio: "Todavía no hay recorridos en la galería. Publica el tuyo y marca «Mostrar en la galería» al publicar.",
    anterior: "Anterior",
    siguiente: "Siguiente",
    pagina: "Página {n} de {m}",
    tour_360: "Recorrido virtual 360",
    tour_en: "Recorrido virtual 360 en {lugar}, {pais}",
    abrir_completo: "Abrir a pantalla completa",
    visor_titulo: "Visor 360 de {titulo}",
    creditos: "Atribuciones",
    autor: "Autor",
    hecho_con: "Hecho con Andarama",
    hecho_texto:
      "Andarama es un editor de recorridos virtuales 360 de código abierto: sube tus fotos, conéctalas como quien dibuja un plano y publica. Gratis en tu servidor, alojado aquí desde 2 $ al mes.",
    crea_el_tuyo: "Crea el tuyo",
    mas_recorridos: "Más recorridos",
    entrar: "Entrar al Studio",
    nav_editor: "editor",
    nav_visor: "visor",
    nav_precios: "precios",
    nav_documentacion: "documentación",
    pie_linea: "código abierto bajo EUPL-1.2 · hecho a mano por José Luis Saorín",
    saltar: "Saltar al contenido",
  },
  en: {
    inicio: "Home",
    explorar: "Explore",
    titulo_indice: "Explore 360 virtual tours",
    titulo_pais: "360 virtual tours in {pais}",
    descripcion_indice:
      "Museums, monuments, classrooms, shops and landscapes as 360 virtual tours made with Andarama. Walk through them in your browser, also with a VR headset.",
    intro:
      "Every tour in this gallery was published by someone using Andarama, the open source 360 tour editor. They run in any browser, nothing to install, and in virtual reality headsets too. Pick a place and step in.",
    por_pais: "By country",
    todos: "All countries",
    vacio: "There are no tours in the gallery yet. Publish yours and tick “Show in the gallery” when publishing.",
    anterior: "Previous",
    siguiente: "Next",
    pagina: "Page {n} of {m}",
    tour_360: "360 virtual tour",
    tour_en: "360 virtual tour in {lugar}, {pais}",
    abrir_completo: "Open full screen",
    visor_titulo: "360 viewer of {titulo}",
    creditos: "Attributions",
    autor: "Author",
    hecho_con: "Made with Andarama",
    hecho_texto:
      "Andarama is an open source 360 virtual tour editor: upload your photos, link them as if drawing a floor plan and publish. Free on your own server, hosted here from $2 a month.",
    crea_el_tuyo: "Create yours",
    mas_recorridos: "More tours",
    entrar: "Open the Studio",
    nav_editor: "editor",
    nav_visor: "viewer",
    nav_precios: "pricing",
    nav_documentacion: "documentation",
    pie_linea: "open source under EUPL-1.2 · handmade by José Luis Saorín",
    saltar: "Skip to content",
  },
  fr: {
    inicio: "Accueil",
    explorar: "Explorer",
    titulo_indice: "Explorez des visites virtuelles 360",
    titulo_pais: "Visites virtuelles 360 en {pais}",
    descripcion_indice:
      "Musées, monuments, salles de classe, commerces et paysages en visites virtuelles 360 réalisées avec Andarama. Parcourez-les depuis le navigateur, aussi avec un casque de réalité virtuelle.",
    intro:
      "Chaque visite de cette galerie a été publiée par quelqu’un avec Andarama, l’éditeur de visites 360 open source. Elles s’ouvrent dans n’importe quel navigateur, sans rien installer, et aussi avec un casque de réalité virtuelle. Choisissez un lieu et entrez.",
    por_pais: "Par pays",
    todos: "Tous les pays",
    vacio: "Il n’y a pas encore de visites dans la galerie. Publiez la vôtre et cochez « Afficher dans la galerie » en publiant.",
    anterior: "Précédent",
    siguiente: "Suivant",
    pagina: "Page {n} sur {m}",
    tour_360: "Visite virtuelle 360",
    tour_en: "Visite virtuelle 360 à {lugar}, {pais}",
    abrir_completo: "Ouvrir en plein écran",
    visor_titulo: "Visionneuse 360 de {titulo}",
    creditos: "Attributions",
    autor: "Auteur",
    hecho_con: "Réalisé avec Andarama",
    hecho_texto:
      "Andarama est un éditeur de visites virtuelles 360 open source : importez vos photos, reliez-les comme on dessine un plan et publiez. Gratuit sur votre serveur, hébergé ici à partir de 2 $ par mois.",
    crea_el_tuyo: "Créez la vôtre",
    mas_recorridos: "Autres visites",
    entrar: "Ouvrir le Studio",
    nav_editor: "éditeur",
    nav_visor: "visionneuse",
    nav_precios: "tarifs",
    nav_documentacion: "documentation",
    pie_linea: "open source sous EUPL-1.2 · fait main par José Luis Saorín",
    saltar: "Aller au contenu",
  },
  de: {
    inicio: "Start",
    explorar: "Entdecken",
    titulo_indice: "Virtuelle 360-Rundgänge entdecken",
    titulo_pais: "Virtuelle 360-Rundgänge in {pais}",
    descripcion_indice:
      "Museen, Denkmäler, Klassenzimmer, Geschäfte und Landschaften als virtuelle 360-Rundgänge, erstellt mit Andarama. Im Browser begehbar, auch mit VR-Brille.",
    intro:
      "Jeder Rundgang in dieser Galerie wurde von jemandem mit Andarama veröffentlicht, dem quelloffenen Editor für 360-Touren. Sie laufen in jedem Browser, ohne Installation, und auch mit VR-Brille. Wähle einen Ort und tritt ein.",
    por_pais: "Nach Land",
    todos: "Alle Länder",
    vacio: "In der Galerie gibt es noch keine Rundgänge. Veröffentliche deinen und wähle beim Veröffentlichen „In der Galerie zeigen“.",
    anterior: "Zurück",
    siguiente: "Weiter",
    pagina: "Seite {n} von {m}",
    tour_360: "Virtueller 360-Rundgang",
    tour_en: "Virtueller 360-Rundgang in {lugar}, {pais}",
    abrir_completo: "Im Vollbild öffnen",
    visor_titulo: "360-Viewer von {titulo}",
    creditos: "Nachweise",
    autor: "Autor",
    hecho_con: "Erstellt mit Andarama",
    hecho_texto:
      "Andarama ist ein quelloffener Editor für virtuelle 360-Rundgänge: Fotos hochladen, wie auf einem Grundriss verbinden und veröffentlichen. Kostenlos auf dem eigenen Server, hier gehostet ab 2 $ im Monat.",
    crea_el_tuyo: "Erstelle deinen",
    mas_recorridos: "Weitere Rundgänge",
    entrar: "Studio öffnen",
    nav_editor: "Editor",
    nav_visor: "Viewer",
    nav_precios: "Preise",
    nav_documentacion: "Dokumentation",
    pie_linea: "Open Source unter EUPL-1.2 · handgemacht von José Luis Saorín",
    saltar: "Zum Inhalt springen",
  },
  it: {
    inicio: "Home",
    explorar: "Esplora",
    titulo_indice: "Esplora tour virtuali 360",
    titulo_pais: "Tour virtuali 360 in {pais}",
    descripcion_indice:
      "Musei, monumenti, aule, negozi e paesaggi in tour virtuali 360 realizzati con Andarama. Percorrili dal browser, anche con un visore di realtà virtuale.",
    intro:
      "Ogni tour di questa galleria è stato pubblicato da qualcuno con Andarama, l’editor open source di tour 360. Si aprono in qualsiasi browser, senza installare nulla, e anche con un visore di realtà virtuale. Scegli un luogo ed entra.",
    por_pais: "Per paese",
    todos: "Tutti i paesi",
    vacio: "Non ci sono ancora tour nella galleria. Pubblica il tuo e spunta «Mostra nella galleria» al momento di pubblicare.",
    anterior: "Precedente",
    siguiente: "Successiva",
    pagina: "Pagina {n} di {m}",
    tour_360: "Tour virtuale 360",
    tour_en: "Tour virtuale 360 a {lugar}, {pais}",
    abrir_completo: "Apri a schermo intero",
    visor_titulo: "Visore 360 di {titulo}",
    creditos: "Attribuzioni",
    autor: "Autore",
    hecho_con: "Fatto con Andarama",
    hecho_texto:
      "Andarama è un editor open source di tour virtuali 360: carica le foto, collegale come se disegnassi una planimetria e pubblica. Gratis sul tuo server, ospitato qui da 2 $ al mese.",
    crea_el_tuyo: "Crea il tuo",
    mas_recorridos: "Altri tour",
    entrar: "Apri lo Studio",
    nav_editor: "editor",
    nav_visor: "visore",
    nav_precios: "prezzi",
    nav_documentacion: "documentazione",
    pie_linea: "open source sotto EUPL-1.2 · fatto a mano da José Luis Saorín",
    saltar: "Vai al contenuto",
  },
  pt: {
    inicio: "Início",
    explorar: "Explorar",
    titulo_indice: "Explore visitas virtuais 360",
    titulo_pais: "Visitas virtuais 360 em {pais}",
    descripcion_indice:
      "Museus, monumentos, salas de aula, lojas e paisagens em visitas virtuais 360 feitas com o Andarama. Percorra-as no navegador, também com óculos de realidade virtual.",
    intro:
      "Cada visita desta galeria foi publicada por alguém com o Andarama, o editor de tours 360 de código aberto. Abrem em qualquer navegador, sem instalar nada, e também com óculos de realidade virtual. Escolha um lugar e entre.",
    por_pais: "Por país",
    todos: "Todos os países",
    vacio: "Ainda não há visitas na galeria. Publique a sua e marque «Mostrar na galeria» ao publicar.",
    anterior: "Anterior",
    siguiente: "Seguinte",
    pagina: "Página {n} de {m}",
    tour_360: "Visita virtual 360",
    tour_en: "Visita virtual 360 em {lugar}, {pais}",
    abrir_completo: "Abrir em ecrã inteiro",
    visor_titulo: "Visualizador 360 de {titulo}",
    creditos: "Atribuições",
    autor: "Autor",
    hecho_con: "Feito com o Andarama",
    hecho_texto:
      "O Andarama é um editor de visitas virtuais 360 de código aberto: carregue as suas fotos, ligue-as como quem desenha uma planta e publique. Grátis no seu servidor, alojado aqui a partir de 2 $ por mês.",
    crea_el_tuyo: "Crie a sua",
    mas_recorridos: "Mais visitas",
    entrar: "Entrar no Studio",
    nav_editor: "editor",
    nav_visor: "visualizador",
    nav_precios: "preços",
    nav_documentacion: "documentação",
    pie_linea: "código aberto sob EUPL-1.2 · feito à mão por José Luis Saorín",
    saltar: "Saltar para o conteúdo",
  },
};

/** Idioma del cromo: el pedido si lo tenemos; si no, inglés; si no, español. */
export function chromeLang(lang: string | null | undefined): string {
  const corto = (lang ?? "").toLowerCase().split("-")[0] ?? "";
  if (corto in STRINGS) return corto;
  return corto === "" ? "es" : "en";
}

function t(lang: string, key: keyof Strings, vars?: Record<string, string | number>): string {
  let out = STRINGS[chromeLang(lang)]![key];
  if (vars != null) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

const OG_LOCALES: Record<string, string> = { es: "es_ES", en: "en_US", fr: "fr_FR", de: "de_DE", it: "it_IT", pt: "pt_PT", ja: "ja_JP" };

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Nombre del país en el idioma pedido; si el runtime no lo sabe, el código. */
export function countryName(code: string, lang: string): string {
  try {
    return new Intl.DisplayNames([lang, "en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Recorta a un máximo de caracteres sin partir palabras (meta description). */
export function truncate(text: string, max = 160): string {
  const limpio = text.replaceAll(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.lastIndexOf(" ", max - 1);
  return `${limpio.slice(0, corte > 40 ? corte : max - 1)}…`;
}

/** Texto plano a párrafos, con las URL convertidas en enlaces. */
function parrafos(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== "")
    .map((p) => `<p>${autoenlazar(escapeHtml(p)).replaceAll("\n", "<br>")}</p>`)
    .join("\n");
}

function autoenlazar(escaped: string): string {
  return escaped.replaceAll(/https?:\/\/[^\s<]+[^\s<.,;:)]/g, (url) => `<a href="${url}" rel="nofollow noopener">${url}</a>`);
}

function jsonLd(obj: object): string {
  // «<» escapado para que un texto con «</script>» no cierre el bloque
  return `<script type="application/ld+json">${JSON.stringify(obj).replaceAll("<", "\\u003c")}</script>`;
}

const ESTILO_GALERIA = `
.galeria { list-style: none; margin: 32px 0 0; padding: 0; display: grid; gap: 18px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.galeria li { margin: 0; }
.tarjeta { display: flex; flex-direction: column; height: 100%; background: var(--papel-2); border: 2px solid var(--borde); border-radius: 18px; overflow: hidden; text-decoration: none; color: var(--tinta); transition: transform 0.12s ease, border-color 0.12s ease; }
.tarjeta:hover { border-color: var(--ambar); transform: translateY(-2px); }
.tarjeta img { display: block; width: 100%; aspect-ratio: 2 / 1; object-fit: cover; background: #201808; }
.tarjeta__cuerpo { padding: 14px 18px 16px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
.tarjeta h2 { margin: 0; font-size: 19px; line-height: 1.2; }
.tarjeta__lugar { margin: 0; font-size: 14px; color: var(--tinta-suave); }
.tarjeta .susurro { margin-top: auto; padding-top: 8px; }
.filtros { margin: 22px 0 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.filtros .susurro { margin-inline-end: 6px; }
.chip { font-family: "Space Mono", monospace; font-size: 12px; text-decoration: none; color: var(--tinta); padding: 5px 12px; border: 2px solid var(--borde); border-radius: 999px; background: var(--papel-2); }
.chip:hover, .chip[aria-current="true"] { border-color: var(--naranja); background: var(--amarillo); }
.paginacion { margin: 36px 0 0; display: flex; justify-content: space-between; align-items: center; gap: 14px; font-family: "Space Mono", monospace; font-size: 12.5px; }
.paginacion span:empty { flex: 1; }
.ficha__visor { margin: 26px 0 0; border: 3px solid var(--tinta); border-radius: 22px; overflow: hidden; box-shadow: 10px 10px 0 var(--amarillo); background: #201808; }
.ficha__visor iframe { display: block; width: 100%; aspect-ratio: 16 / 9; border: 0; }
.ficha .acciones { margin-top: 22px; justify-content: flex-start; }
.ficha__texto { margin-top: 30px; }
.ficha__creditos { margin-top: 26px; border-top: 2px solid var(--borde); padding-top: 14px; }
.ficha__creditos h2 { font-family: "Space Mono", monospace; font-size: 11.5px; font-weight: 400; color: var(--tinta-suave); margin: 0 0 6px; text-transform: lowercase; }
.ficha__creditos p { margin: 0; font-size: 14px; color: var(--tinta-suave); }
.ficha__creditos a { color: var(--naranja-tinta); }
.relacionados { max-width: 1080px; margin: 60px auto 0; padding: 0 24px; }
.relacionados h2 { font-size: clamp(24px, 3.4vw, 32px); }
.relacionados .galeria { margin-top: 18px; }
.vacio { margin-top: 32px; font-size: 17px; color: var(--tinta-suave); max-width: 560px; }
`;

// ---------------------------------------------------------------------------
// Armazón: cabecera, pie y metadatos
// ---------------------------------------------------------------------------

interface LayoutOptions {
  lang: string;
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  ogImageAlt: string;
  /** Etiquetas extra del <head> (rel=next/prev...). */
  head?: string;
  jsonld: object[];
  body: string;
  chrome: GalleryChrome;
}

function layout(o: LayoutOptions): string {
  const l = chromeLang(o.lang);
  const base = o.chrome.base;
  const ogLocale = OG_LOCALES[o.lang.split("-")[0] ?? ""] ?? o.lang;
  return `<!doctype html>
<html lang="${escapeHtml(o.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${escapeHtml(o.title)}</title>
<meta name="description" content="${escapeHtml(o.description)}">
<link rel="icon" type="image/svg+xml" href="/logo-andarama.svg">
<link rel="canonical" href="${escapeHtml(o.canonical)}">
<meta property="og:title" content="${escapeHtml(o.title)}">
<meta property="og:description" content="${escapeHtml(o.description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="andarama">
<meta property="og:locale" content="${escapeHtml(ogLocale)}">
<meta property="og:url" content="${escapeHtml(o.canonical)}">
<meta property="og:image" content="${escapeHtml(o.ogImage)}">
<meta property="og:image:alt" content="${escapeHtml(o.ogImageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f7f2e7">
<link rel="preload" href="/fonts/Baloo2-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/SpaceMono-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/landing/estilo.css">
<link rel="stylesheet" href="/landing/sitio.css">
<style>${ESTILO_GALERIA}</style>
${o.head ?? ""}
${o.jsonld.map(jsonLd).join("\n")}
</head>
<body>
<a class="salto" href="#contenido">${t(l, "saltar")}</a>
<header class="cabecera">
  <a class="marca" href="${base}/" aria-label="andarama"><img src="/logo-andarama.svg" alt="" width="48" height="48"><span>andarama</span></a>
  <nav class="cabecera__nav" aria-label="Principal">
    <a href="${base}/#editor">${t(l, "nav_editor")}</a>
    <a href="${base}/#visor">${t(l, "nav_visor")}</a>
    <a href="${base}/#precios">${t(l, "nav_precios")}</a>
    <a href="${base}/explorar/" aria-current="true">${t(l, "explorar").toLowerCase()}</a>
    <a href="https://docs.andarama.com">${t(l, "nav_documentacion")}</a>
    <a class="btn btn--chico" href="${escapeHtml(o.chrome.studioUrl)}">${t(l, "entrar")}</a>
  </nav>
</header>
<main id="contenido">
${o.body}
</main>
<footer class="pie">
  <div class="pie__linea"><img src="/logo-andarama.svg" alt="" width="26" height="26" loading="lazy"><span>andarama</span></div>
  <p class="susurro">${t(l, "pie_linea")} · <a href="https://github.com/joseluissaorin/andarama">GitHub</a></p>
  <p class="susurro"><a href="${base}/">andarama.com</a> · <a href="${escapeHtml(o.chrome.studioUrl)}">Studio</a> · <a href="https://docs.andarama.com">docs.andarama.com</a></p>
</footer>
</body>
</html>`;
}

function migas(lang: string, base: string, ultimo?: { name: string; url: string }): { html: string; jsonld: object } {
  const l = chromeLang(lang);
  const items = [
    { name: t(l, "inicio"), url: `${base}/` },
    { name: t(l, "explorar"), url: `${base}/explorar/` },
    ...(ultimo != null ? [ultimo] : []),
  ];
  const html = `<nav class="migas" aria-label="Migas"><ol>${items
    .map((it, i) => (i === items.length - 1 ? `<li aria-current="page">${escapeHtml(it.name)}</li>` : `<li><a href="${escapeHtml(it.url)}">${escapeHtml(it.name)}</a></li>`))
    .join("")}</ol></nav>`;
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
  return { html, jsonld };
}

function tarjeta(item: GalleryItem, lang: string): string {
  const l = chromeLang(lang);
  return `<li><a class="tarjeta" href="${escapeHtml(item.pageUrl)}" hreflang="${escapeHtml(item.lang)}">
  <img src="${escapeHtml(item.posterUrl)}" alt="" loading="lazy" width="1200" height="600">
  <div class="tarjeta__cuerpo">
    <h2 lang="${escapeHtml(item.lang)}">${escapeHtml(item.title)}</h2>
    <p class="tarjeta__lugar">${escapeHtml(item.placeName)} · ${escapeHtml(countryName(item.placeCountry, l))}</p>
    <span class="susurro">${t(l, "tour_360").toLowerCase()} · ${escapeHtml(item.lang)}</span>
  </div>
</a></li>`;
}

// ---------------------------------------------------------------------------
// Índice
// ---------------------------------------------------------------------------

export interface GalleryIndexOptions {
  chrome: GalleryChrome;
  /** Idioma del cromo (el filtro `lang`, o español). */
  lang: string;
  items: GalleryItem[];
  page: number;
  pages: number;
  total: number;
  /** Filtro de país activo (ISO-2) o null. */
  country: string | null;
  /** Filtro de idioma activo o null. */
  langFilter: string | null;
  /** Países con recorridos, para los filtros. */
  countries: { code: string; count: number }[];
}

/** URL del índice con los filtros dados (sin parámetros vacíos). */
export function galleryIndexUrl(base: string, q: { page?: number; country?: string | null; lang?: string | null }): string {
  const params = new URLSearchParams();
  if (q.lang != null && q.lang !== "") params.set("lang", q.lang);
  if (q.country != null && q.country !== "") params.set("country", q.country);
  if (q.page != null && q.page > 1) params.set("page", String(q.page));
  const qs = params.toString();
  return `${base}/explorar/${qs !== "" ? `?${qs}` : ""}`;
}

export function renderGalleryIndex(o: GalleryIndexOptions): string {
  const l = chromeLang(o.lang);
  const base = o.chrome.base;
  const pais = o.country != null ? countryName(o.country, l) : null;
  const titulo = pais != null ? t(l, "titulo_pais", { pais }) : t(l, "titulo_indice");
  const canonical = galleryIndexUrl(base, { page: o.page, country: o.country, lang: o.langFilter });
  const head = [
    o.page > 1 ? `<link rel="prev" href="${escapeHtml(galleryIndexUrl(base, { page: o.page - 1, country: o.country, lang: o.langFilter }))}">` : "",
    o.page < o.pages ? `<link rel="next" href="${escapeHtml(galleryIndexUrl(base, { page: o.page + 1, country: o.country, lang: o.langFilter }))}">` : "",
  ]
    .filter((s) => s !== "")
    .join("\n");
  const m = migas(l, base);
  const filtros =
    o.countries.length > 0
      ? `<div class="filtros"><span class="susurro">${t(l, "por_pais")}</span>
  <a class="chip" href="${escapeHtml(galleryIndexUrl(base, { lang: o.langFilter }))}"${o.country == null ? ' aria-current="true"' : ""}>${t(l, "todos")}</a>
  ${o.countries
    .map(
      (c) =>
        `<a class="chip" href="${escapeHtml(galleryIndexUrl(base, { country: c.code, lang: o.langFilter }))}"${o.country === c.code ? ' aria-current="true"' : ""}>${escapeHtml(countryName(c.code, l))} <span class="vh">(</span>${c.count}<span class="vh">)</span></a>`,
    )
    .join("\n  ")}
</div>`
      : "";
  const rejilla =
    o.items.length > 0 ? `<ul class="galeria">\n${o.items.map((it) => tarjeta(it, l)).join("\n")}\n</ul>` : `<p class="vacio">${t(l, "vacio")}</p>`;
  const paginacion =
    o.pages > 1
      ? `<nav class="paginacion" aria-label="${t(l, "pagina", { n: o.page, m: o.pages })}">
  ${o.page > 1 ? `<a rel="prev" href="${escapeHtml(galleryIndexUrl(base, { page: o.page - 1, country: o.country, lang: o.langFilter }))}">← ${t(l, "anterior")}</a>` : "<span></span>"}
  <span>${t(l, "pagina", { n: o.page, m: o.pages })}</span>
  ${o.page < o.pages ? `<a rel="next" href="${escapeHtml(galleryIndexUrl(base, { page: o.page + 1, country: o.country, lang: o.langFilter }))}">${t(l, "siguiente")} →</a>` : "<span></span>"}
</nav>`
      : "";
  const body = `${m.html}
<section class="pagina">
  <div class="pagina__cabeza">
    <h1>${escapeHtml(titulo)}</h1>
    <p class="lead">${t(l, "intro")}</p>
  </div>
  ${filtros}
  ${rejilla}
  ${paginacion}
</section>`;
  const lista = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: titulo,
    url: canonical,
    inLanguage: l,
    isPartOf: { "@type": "WebSite", name: "andarama", url: `${base}/` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: o.total,
      itemListElement: o.items.map((it, i) => ({
        "@type": "ListItem",
        position: (o.page - 1) * o.items.length + i + 1,
        name: it.title,
        url: it.pageUrl,
        image: it.posterUrl,
      })),
    },
  };
  return layout({
    lang: l,
    title: `${titulo} | andarama`,
    description: t(l, "descripcion_indice"),
    canonical,
    ogImage: o.items[0]?.posterUrl ?? `${base}/og.png`,
    ogImageAlt: titulo,
    head,
    jsonld: [lista, m.jsonld],
    body,
    chrome: o.chrome,
  });
}

// ---------------------------------------------------------------------------
// Ficha de un recorrido
// ---------------------------------------------------------------------------

export interface GalleryTourOptions {
  chrome: GalleryChrome;
  item: GalleryItem;
  /** Autor declarado en el tour (`meta.author`), si lo hay. */
  author: string | null;
  related: GalleryItem[];
}

export function renderGalleryTour(o: GalleryTourOptions): string {
  const { item } = o;
  const l = chromeLang(item.lang);
  const base = o.chrome.base;
  const pais = countryName(item.placeCountry, l);
  const subtitulo = t(l, "tour_en", { lugar: item.placeName, pais });
  const m = migas(l, base, { name: item.title, url: item.pageUrl });
  const creditos =
    item.credits != null || o.author != null
      ? `<section class="ficha__creditos">
    <h2>${t(l, "creditos")}</h2>
    ${o.author != null ? `<p>${t(l, "autor")}: ${escapeHtml(o.author)}</p>` : ""}
    ${item.credits != null ? parrafos(item.credits) : ""}
  </section>`
      : "";
  const relacionados =
    o.related.length > 0
      ? `<section class="relacionados">
  <h2>${t(l, "mas_recorridos")}</h2>
  <ul class="galeria">
${o.related.map((it) => tarjeta(it, l)).join("\n")}
  </ul>
</section>`
      : "";
  const body = `${m.html}
<article class="pagina ficha" lang="${escapeHtml(item.lang)}">
  <div class="pagina__cabeza">
    <p class="susurro">${escapeHtml(t(l, "tour_360"))}</p>
    <h1>${escapeHtml(item.title)}</h1>
    <p class="lead">${escapeHtml(subtitulo)}</p>
  </div>
  <div class="ficha__visor">
    <iframe src="${escapeHtml(item.tourUrl)}" title="${escapeHtml(t(l, "visor_titulo", { titulo: item.title }))}" loading="lazy" allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer" allowfullscreen></iframe>
  </div>
  <div class="acciones">
    <a class="btn" href="${escapeHtml(item.tourUrl)}" target="_blank" rel="noopener">${t(l, "abrir_completo")}</a>
  </div>
  <div class="ficha__texto prosa">
    ${parrafos(item.description)}
  </div>
  ${creditos}
  <aside class="caja">
    <p class="susurro">${t(l, "hecho_con")}</p>
    <h2>${t(l, "crea_el_tuyo")}</h2>
    <p>${t(l, "hecho_texto")}</p>
    <a class="btn" href="${escapeHtml(o.chrome.studioUrl)}" data-cta="registro">${t(l, "crea_el_tuyo")}</a>
  </aside>
</article>
${relacionados}`;

  const imagenId = `${item.pageUrl}#portada`;
  const lugar: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": item.lat != null && item.lng != null ? "TouristAttraction" : "Place",
    "@id": `${item.pageUrl}#lugar`,
    name: item.title,
    description: item.description,
    url: item.pageUrl,
    image: { "@id": imagenId },
    address: { "@type": "PostalAddress", addressLocality: item.placeName, addressCountry: item.placeCountry },
    isAccessibleForFree: true,
    potentialAction: { "@type": "ViewAction", name: t(l, "tour_360"), target: item.tourUrl },
  };
  if (item.lat != null && item.lng != null) {
    lugar.geo = { "@type": "GeoCoordinates", latitude: item.lat, longitude: item.lng };
  }
  const imagen = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    "@id": imagenId,
    contentUrl: item.posterUrl,
    url: item.posterUrl,
    caption: item.title,
    representativeOfPage: true,
    inLanguage: item.lang,
  };
  return layout({
    lang: item.lang,
    title: `${item.title} · ${t(l, "tour_360")} | andarama`,
    description: truncate(item.description),
    canonical: item.pageUrl,
    ogImage: item.posterUrl,
    ogImageAlt: item.title,
    jsonld: [lugar, m.jsonld, imagen],
    body,
    chrome: o.chrome,
  });
}
