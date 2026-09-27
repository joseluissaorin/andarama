#!/usr/bin/env node
/**
 * Monta y publica en la galería pública de Andarama un tour de un lugar a
 * partir de panorámicas libres de Wikimedia Commons (§3 y §9 del estudio SEO:
 * cada tour de un lugar conocido es una página que posiciona por su nombre).
 *
 * Uso:
 *   ANDARAMA_TOKEN=andarama_... node tooling/commons/montar-monumento.mjs tooling/commons/encargos/{slug}.json
 *   node tooling/commons/montar-monumento.mjs encargo.json --email x --password y --base http://localhost:8788
 *
 * Variables: ANDARAMA_TOKEN (Bearer con scopes projects:write, media:write y
 * publish), ANDARAMA_BASE (por defecto https://app.andarama.com), ANDARAMA_ORG
 * (organización; si no, la primera del usuario). Opciones: --base, --email y
 * --password (sesión con cookie, para instancias self-host sin token),
 * --org, --dry-run (descarga y comprueba sin tocar la instancia), --no-verify.
 *
 * Sigue el mismo camino que scripts/seed-demo.mjs: subida prefirmada del
 * original, tiles generados aquí con el tiler Node del repo, escenas con
 * texto alternativo y descripción, hotspots de navegación, créditos por
 * escena y publicación con la ficha de la galería. Es idempotente: si el slug
 * ya está publicado por un proyecto de la organización, se reutiliza ese
 * proyecto (se reemplazan sus escenas) y se publica una versión nueva.
 * Sin dependencias fuera del repo (el tiler y sharp viven en packages/tiler).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = fileURLToPath(new URL(".", import.meta.url));
const CACHE = join(AQUI, "cache");
const TILER = new URL("../../packages/tiler/dist/node/index.js", import.meta.url);
const UA = "Andarama/1.0 (https://andarama.com; montaje de tours desde Wikimedia Commons)";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const ANCHO_MAX = 16384;
const ANCHO_MIN = 4000;

// ---------------------------------------------------------------------------
// Argumentos y encargo
// ---------------------------------------------------------------------------

function leerArgumentos(argv) {
  const opts = { dryRun: false, verify: true };
  const libres = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--no-verify") opts.verify = false;
    else if (a.startsWith("--")) {
      const clave = a.slice(2);
      const valor = argv[i + 1];
      if (valor == null || valor.startsWith("--")) throw new Error(`Falta el valor de --${clave}`);
      opts[clave] = valor;
      i++;
    } else libres.push(a);
  }
  if (libres.length !== 1) {
    console.error("Uso: node tooling/commons/montar-monumento.mjs <encargo.json> [--base URL] [--email X --password Y] [--org ID] [--dry-run] [--no-verify]");
    process.exit(2);
  }
  opts.encargo = libres[0];
  opts.base = (opts.base ?? process.env.ANDARAMA_BASE ?? "https://app.andarama.com").replace(/\/$/, "");
  opts.token = process.env.ANDARAMA_TOKEN ?? null;
  opts.org = opts.org ?? process.env.ANDARAMA_ORG ?? null;
  return opts;
}

/** Mismo slug que la API (apps/api/src/lib/util.ts) para poder compararlos. */
function slugify(input) {
  return (
    String(input)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "sin-titulo"
  );
}

const esTodo = (s) => typeof s !== "string" || s.trim() === "" || /^\s*TODO\b/i.test(s);

function validarEncargo(e, ruta) {
  const fallos = [];
  if (typeof e.slug !== "string" || !/^[a-z0-9-]{3,80}$/.test(e.slug)) fallos.push("slug: de 3 a 80 caracteres, solo a-z, 0-9 y guion");
  if (typeof e.lang !== "string" || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(e.lang)) fallos.push("lang: código de idioma (es, en, pt-BR...)");
  if (esTodo(e.title)) fallos.push("title: escribe el título SEO de la ficha (está vacío o marcado TODO)");
  else if (e.title.trim().length < 3 || e.title.trim().length > 120) fallos.push("title: entre 3 y 120 caracteres");
  if (esTodo(e.description)) fallos.push("description: escribe la descripción de la ficha (está vacía o marcada TODO)");
  else if (e.description.trim().length < 300 || e.description.trim().length > 600) fallos.push(`description: entre 300 y 600 caracteres (tiene ${e.description.trim().length})`);
  if (esTodo(e.placeName) || e.placeName.trim().length < 2) fallos.push("placeName: nombre del lugar");
  if (typeof e.placeCountry !== "string" || !/^[A-Za-z]{2}$/.test(e.placeCountry)) fallos.push("placeCountry: país en ISO 3166-1 alfa-2 (ES, FR, DE...)");
  const tieneLat = e.lat != null;
  const tieneLng = e.lng != null;
  if (tieneLat !== tieneLng) fallos.push("lat y lng van juntas");
  if (tieneLat && (typeof e.lat !== "number" || Math.abs(e.lat) > 90)) fallos.push("lat: número entre -90 y 90");
  if (tieneLng && (typeof e.lng !== "number" || Math.abs(e.lng) > 180)) fallos.push("lng: número entre -180 y 180");
  if (!Array.isArray(e.scenes) || e.scenes.length === 0) fallos.push("scenes: al menos una escena");
  const ids = new Set();
  for (const [i, s] of (e.scenes ?? []).entries()) {
    const p = `scenes[${i}]`;
    s.id = typeof s.id === "string" && s.id !== "" ? s.id : slugify(esTodo(s.title) ? `escena-${i + 1}` : s.title);
    if (ids.has(s.id)) fallos.push(`${p}.id: repetido (${s.id})`);
    ids.add(s.id);
    if (typeof s.file !== "string" && typeof s.commonsPage !== "string") fallos.push(`${p}: hace falta file (URL del original) o commonsPage`);
    if (esTodo(s.title)) fallos.push(`${p}.title: escribe el título de la escena`);
    if (esTodo(s.alt)) fallos.push(`${p}.alt: escribe el texto alternativo`);
    if (typeof s.commonsPage !== "string" || !/^https?:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(s.commonsPage)) fallos.push(`${p}.commonsPage: URL de la página del fichero en Commons`);
  }
  if (e.scenes?.length > 0) {
    const inicio = resolverEscena(e, e.startScene);
    if (inicio == null) fallos.push("startScene: debe ser el id, el título o el fichero de una de las escenas");
    else e.startScene = inicio.id;
  }
  for (const [i, l] of (e.links ?? []).entries()) {
    const de = resolverEscena(e, l.from);
    const a = resolverEscena(e, l.to);
    if (de == null || a == null) fallos.push(`links[${i}]: from/to deben nombrar escenas del encargo`);
    else {
      l.from = de.id;
      l.to = a.id;
    }
    if (typeof l.yaw !== "number" || typeof l.pitch !== "number") fallos.push(`links[${i}]: yaw y pitch en radianes`);
  }
  if (fallos.length > 0) {
    console.error(`El encargo ${ruta} no está listo:\n  - ${fallos.join("\n  - ")}`);
    process.exit(1);
  }
}

function resolverEscena(e, ref) {
  if (ref == null) return e.scenes[0];
  return e.scenes.find((s) => s.id === ref || s.title === ref || s.file === ref || (typeof s.file === "string" && basename(s.file) === ref)) ?? null;
}

// ---------------------------------------------------------------------------
// Textos visibles por idioma (etiquetas de hotspots y créditos)
// ---------------------------------------------------------------------------

const TEXTOS = {
  es: { ir: (t) => `Ir a ${t}`, volver: (t) => `Volver a ${t}`, foto: "Fotografía", fotos: "Fotografías", creditos: "Créditos", sobre: "Sobre este recorrido", cuerpo: "Las fotografías esféricas de este recorrido proceden de Wikimedia Commons y se usan con su licencia libre:" },
  en: { ir: (t) => `Go to ${t}`, volver: (t) => `Back to ${t}`, foto: "Photograph", fotos: "Photographs", creditos: "Credits", sobre: "About this tour", cuerpo: "The spherical photographs in this tour come from Wikimedia Commons and are used under their free licence:" },
  fr: { ir: (t) => `Aller à ${t}`, volver: (t) => `Revenir à ${t}`, foto: "Photographie", fotos: "Photographies", creditos: "Crédits", sobre: "À propos de cette visite", cuerpo: "Les photographies sphériques de cette visite proviennent de Wikimedia Commons et sont utilisées sous leur licence libre :" },
  de: { ir: (t) => `Weiter zu ${t}`, volver: (t) => `Zurück zu ${t}`, foto: "Foto", fotos: "Fotos", creditos: "Bildnachweis", sobre: "Über diese Tour", cuerpo: "Die Kugelpanoramen dieser Tour stammen aus Wikimedia Commons und werden unter ihrer freien Lizenz verwendet:" },
  it: { ir: (t) => `Vai a ${t}`, volver: (t) => `Torna a ${t}`, foto: "Fotografia", fotos: "Fotografie", creditos: "Crediti", sobre: "Su questo tour", cuerpo: "Le fotografie sferiche di questo tour provengono da Wikimedia Commons e sono usate con la loro licenza libera:" },
  pt: { ir: (t) => `Ir para ${t}`, volver: (t) => `Voltar a ${t}`, foto: "Fotografia", fotos: "Fotografias", creditos: "Créditos", sobre: "Sobre este passeio", cuerpo: "As fotografias esféricas deste passeio vêm da Wikimedia Commons e são usadas com a sua licença livre:" },
};
const textos = (lang) => TEXTOS[String(lang).slice(0, 2)] ?? TEXTOS.es;

// ---------------------------------------------------------------------------
// Wikimedia Commons: metadatos y descarga a la caché local
// ---------------------------------------------------------------------------

const sha1 = (s) => createHash("sha1").update(s).digest("hex").slice(0, 12);
const sinHtml = (s) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function fetchCommons(url, init = {}) {
  for (let intento = 0; intento < 4; intento++) {
    try {
      const res = await fetch(url, { ...init, headers: { "user-agent": UA, ...(init.headers ?? {}) } });
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) throw new Error(`${res.status} ${res.statusText}`);
    } catch (err) {
      if (intento === 3) throw err;
    }
    await new Promise((r) => setTimeout(r, 1500 * (intento + 1)));
  }
  throw new Error(`No se pudo descargar ${url}`);
}

/** Título «File:...» a partir de la URL de la página en Commons. */
function tituloDePagina(commonsPage) {
  const parte = commonsPage.split("/wiki/")[1] ?? "";
  return decodeURIComponent(parte).replace(/_/g, " ").split("#")[0];
}

/** Autor, licencia y URL del original según Commons (con caché en disco). */
async function metadatosCommons(commonsPage) {
  const titulo = tituloDePagina(commonsPage);
  const f = join(CACHE, `meta-${sha1(titulo)}.json`);
  try {
    return JSON.parse(await readFile(f, "utf8"));
  } catch {
    // no está en caché
  }
  const params = new URLSearchParams({ action: "query", titles: titulo, prop: "imageinfo", iiprop: "url|size|extmetadata|mime", format: "json", formatversion: "2" });
  const res = await fetchCommons(`${COMMONS_API}?${params}`);
  const data = await res.json();
  const page = data?.query?.pages?.[0];
  const ii = page?.imageinfo?.[0];
  if (ii == null) throw new Error(`Commons no devuelve información de «${titulo}»`);
  const meta = ii.extmetadata ?? {};
  const info = {
    titulo,
    pagina: ii.descriptionurl ?? commonsPage,
    url: ii.url,
    ancho: ii.width,
    alto: ii.height,
    mime: ii.mime,
    licencia: sinHtml(meta.LicenseShortName?.value) || "licencia desconocida",
    licenciaUrl: sinHtml(meta.LicenseUrl?.value) || null,
    autor: sinHtml(meta.Artist?.value) || sinHtml(meta.Credit?.value) || "autor desconocido",
    atribucion: sinHtml(meta.Attribution?.value) || null,
  };
  await writeFile(f, JSON.stringify(info, null, 2));
  return info;
}

/** Ancho y alto leyendo solo la cabecera (JPEG o PNG); null si no se reconoce. */
function dimensiones(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20), tipo: "image/png" };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marca = buf[i + 1];
      if (marca === 0xd8 || (marca >= 0xd0 && marca <= 0xd7) || marca === 0x01 || marca === 0xff) {
        i += marca === 0xff ? 1 : 2;
        continue;
      }
      const largo = buf.readUInt16BE(i + 2);
      const esSof = marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc;
      if (esSof) return { alto: buf.readUInt16BE(i + 5), ancho: buf.readUInt16BE(i + 7), tipo: "image/jpeg" };
      i += 2 + largo;
    }
  }
  return null;
}

async function existe(f) {
  try {
    return (await stat(f)).size > 0;
  } catch {
    return false;
  }
}

/** sharp del repo (dependencia opcional de packages/tiler); null si no está. */
async function cargarSharp() {
  try {
    const require = createRequire(new URL("../../packages/tiler/package.json", import.meta.url));
    return require("sharp");
  } catch {
    return null;
  }
}

/**
 * Descarga el original a tooling/commons/cache/ (si no está ya), comprueba
 * que es equirectangular 2:1 y de al menos 4000 px y, si supera 16 384 px
 * de ancho, lo reduce con sharp (o avisa si no está disponible).
 */
async function obtenerPanorama(escena, info, log) {
  const url = escena.file ?? info.url;
  const nombre = decodeURIComponent(basename(new URL(url).pathname)).replace(/[^\w.\-]+/g, "_");
  const original = join(CACHE, `${sha1(url)}-${nombre}`);
  if (!(await existe(original))) {
    log(`${escena.id}: descargando ${nombre}`);
    const res = await fetchCommons(url);
    await writeFile(original, Buffer.from(await res.arrayBuffer()));
  } else log(`${escena.id}: en caché (${nombre})`);
  let buf = await readFile(original);
  let dim = dimensiones(buf);
  if (dim == null) {
    const sharp = await cargarSharp();
    if (sharp == null) throw new Error(`${escena.id}: formato no reconocido y sharp no está disponible`);
    const m = await sharp(buf, { limitInputPixels: false }).metadata();
    dim = { ancho: m.width, alto: m.height, tipo: `image/${m.format === "jpg" ? "jpeg" : m.format}` };
  }
  if (Math.abs(dim.ancho / dim.alto - 2) > 0.02) throw new Error(`${escena.id}: no es equirectangular 2:1 (${dim.ancho}×${dim.alto})`);
  if (dim.ancho < ANCHO_MIN) throw new Error(`${escena.id}: demasiado pequeño (${dim.ancho} px; mínimo ${ANCHO_MIN})`);
  if (!["image/jpeg", "image/png", "image/webp"].includes(dim.tipo)) throw new Error(`${escena.id}: tipo ${dim.tipo} no admitido como panorama`);
  if (dim.ancho > ANCHO_MAX) {
    const reducido = join(CACHE, `${sha1(url)}-${ANCHO_MAX}-${nombre.replace(/\.[^.]+$/, "")}.jpg`);
    if (!(await existe(reducido))) {
      const sharp = await cargarSharp();
      if (sharp == null) {
        log(`AVISO ${escena.id}: ${dim.ancho} px supera los ${ANCHO_MAX} y sharp no está disponible; se sube tal cual`);
      } else {
        log(`${escena.id}: reduciendo de ${dim.ancho} a ${ANCHO_MAX} px`);
        await sharp(buf, { limitInputPixels: false }).resize(ANCHO_MAX, ANCHO_MAX / 2, { fit: "fill" }).jpeg({ quality: 92 }).toFile(reducido);
      }
    }
    if (await existe(reducido)) {
      buf = await readFile(reducido);
      dim = { ancho: ANCHO_MAX, alto: ANCHO_MAX / 2, tipo: "image/jpeg" };
    }
  }
  return { buf, ...dim, nombre: dim.tipo === "image/jpeg" ? nombre.replace(/\.[^.]+$/, "") + ".jpg" : nombre };
}

// ---------------------------------------------------------------------------
// Cliente de la API (token Bearer o sesión con cookie, como el seed)
// ---------------------------------------------------------------------------

function crearCliente(base, token) {
  const cookies = new Map();
  let csrf = "";
  const cookieHeader = () => [...cookies.values()].join("; ");

  async function call(path, { method = "GET", body, raw = false, headers = {} } = {}) {
    const h = { ...headers };
    if (token != null) h.authorization = `Bearer ${token}`;
    else {
      h.cookie = cookieHeader();
      if (method !== "GET") h["x-csrf-token"] = csrf;
    }
    if (body != null && !(body instanceof Uint8Array)) {
      h["content-type"] = "application/json";
      body = JSON.stringify(body);
    }
    const res = await fetch(base + path, { method, headers: h, body });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const name = pair.split("=")[0];
      cookies.set(name, pair);
      if (name === "u3c") csrf = pair.split("=")[1] ?? "";
    }
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${(await res.text()).slice(0, 400)}`);
    if (raw) return res;
    const text = await res.text();
    return text === "" ? {} : JSON.parse(text);
  }

  async function putUrl(url, data, contentType) {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(url, { method: "PUT", body: data, headers: contentType ? { "content-type": contentType } : {} });
      if (res.ok) return;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
    throw new Error(`PUT falló: ${url.slice(0, 90)}`);
  }

  return { call, putUrl };
}

// ---------------------------------------------------------------------------
// Subida + tiles (mismo flujo que scripts/seed-demo.mjs)
// ---------------------------------------------------------------------------

async function subirPanorama(api, tilePanoramaNode, orgId, pano, log) {
  const sha = createHash("sha256").update(pano.buf).digest("hex");
  const created = await api.call("/api/v1/media", {
    method: "POST",
    body: { orgId, kind: "panorama", filename: pano.nombre, mime: pano.tipo, bytes: pano.buf.length, sha256: sha },
  });
  if (created.deduplicated) {
    log(`${pano.nombre}: ya existía en la biblioteca (dedup)`);
    return created.media.id;
  }
  const mediaId = created.media.id;
  log(`${pano.nombre}: subiendo original (${(pano.buf.length / 1024 / 1024).toFixed(1)} MB)`);
  await api.putUrl(created.upload.url, pano.buf, pano.tipo);

  log(`${pano.nombre}: generando tiles`);
  const pendientes = [];
  let lote = [];
  const vaciar = async () => {
    if (lote.length === 0) return;
    const items = lote;
    lote = [];
    const { urls } = await api.call(`/api/v1/media/${mediaId}/derivative-uploads`, { method: "POST", body: { keys: items.map((b) => b.key) } });
    const cola = [...items];
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (;;) {
          const item = cola.shift();
          if (item == null) return;
          await api.putUrl(urls[item.key], item.data);
        }
      }),
    );
  };
  let n = 0;
  const result = await tilePanoramaNode(pano.buf, { format: "webp" }, async (tile) => {
    lote.push({ key: `tiles/${mediaId}/${tile.key}`, data: tile.data });
    n++;
    if (lote.length >= 100) {
      pendientes.push(vaciar());
      if (pendientes.length % 3 === 0) await Promise.all(pendientes);
    }
  });
  await vaciar();
  await Promise.all(pendientes);
  log(`${pano.nombre}: ${n} tiles subidos`);

  const { urls } = await api.call(`/api/v1/media/${mediaId}/derivative-uploads`, {
    method: "POST",
    body: { keys: [`derived/${mediaId}/thumb.jpg`, `derived/${mediaId}/og.jpg`] },
  });
  await api.putUrl(urls[`derived/${mediaId}/thumb.jpg`], result.thumbnail, "image/jpeg");
  await api.putUrl(urls[`derived/${mediaId}/og.jpg`], result.ogImage, "image/jpeg");
  await api.call(`/api/v1/media/${mediaId}/derivatives`, { method: "POST", body: { kind: "tiles", manifest: result.manifest } });
  await api.call(`/api/v1/media/${mediaId}/derivatives`, { method: "POST", body: { kind: "thumb", manifest: {} } });
  await api.call(`/api/v1/media/${mediaId}/derivatives`, { method: "POST", body: { kind: "og", manifest: {} } });
  await api.call(`/api/v1/media/${mediaId}/complete`, { method: "POST", body: { width: result.sourceWidth, height: result.sourceHeight } });
  log(`${pano.nombre}: listo (${result.manifest.levels} niveles, cara ${result.manifest.faceSize} px)`);
  return mediaId;
}

// ---------------------------------------------------------------------------
// Créditos
// ---------------------------------------------------------------------------

/** «Fotografía: {autor}, {licencia}, Wikimedia Commons ({pagina})» por escena. */
function lineaCredito(t, escena, info) {
  return `${escena.title}. ${t.foto}: ${info.autor}, ${info.licencia}, Wikimedia Commons (${info.pagina})`;
}

/** Créditos de la ficha (máximo 1000 caracteres): por escena si caben; si no, agrupados por autor y licencia. */
function creditosFicha(t, escenas, infos) {
  const porEscena = escenas.map((s) => lineaCredito(t, s, infos.get(s.id))).join("\n");
  if (porEscena.length <= 1000) return porEscena;
  const grupos = new Map();
  for (const s of escenas) {
    const i = infos.get(s.id);
    const k = `${i.autor}|${i.licencia}`;
    if (!grupos.has(k)) grupos.set(k, { autor: i.autor, licencia: i.licencia, paginas: [] });
    grupos.get(k).paginas.push(i.pagina);
  }
  let texto = [...grupos.values()].map((g) => `${t.fotos}: ${g.autor}, ${g.licencia}, Wikimedia Commons (${g.paginas.join(" ; ")})`).join("\n");
  if (texto.length > 1000) texto = [...grupos.values()].map((g) => `${t.fotos}: ${g.autor}, ${g.licencia}, Wikimedia Commons`).join("\n").slice(0, 1000);
  return texto;
}

/** meta.author del tour: autores y licencias, sin repetir. */
function autorTour(t, infos) {
  const pares = [...new Set([...infos.values()].map((i) => `${i.autor} (${i.licencia})`))];
  return `${t.fotos}: ${pares.join("; ")}, Wikimedia Commons`.slice(0, 200);
}

/** Cuerpo Markdown del panel de créditos del tour (sin límite de longitud). */
function panelCreditos(t, escenas, infos) {
  const lineas = escenas.map((s) => {
    const i = infos.get(s.id);
    const url = i.pagina.replaceAll("(", "%28").replaceAll(")", "%29");
    const lic = i.licenciaUrl != null ? `[${i.licencia}](${i.licenciaUrl})` : i.licencia;
    return `- **${s.title}**: ${t.foto.toLowerCase()} ${i.autor}, ${lic}, [Wikimedia Commons](${url})`;
  });
  return `${t.cuerpo}\n\n${lineas.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

async function main() {
  const opts = leerArgumentos(process.argv.slice(2));
  const log = (m) => console.log(`== ${m}`);
  const encargo = JSON.parse(await readFile(opts.encargo, "utf8"));
  validarEncargo(encargo, opts.encargo);
  const t = textos(encargo.lang);
  await mkdir(CACHE, { recursive: true });

  // 1. Metadatos de Commons y descarga a la caché
  const infos = new Map();
  const panos = new Map();
  for (const s of encargo.scenes) {
    const info = await metadatosCommons(s.commonsPage);
    // Lo que trae el encargo manda (autor o licencia corregidos a mano)
    if (typeof s.author === "string" && s.author !== "") info.autor = s.author;
    if (typeof s.license === "string" && s.license !== "") info.licencia = s.license;
    infos.set(s.id, info);
    panos.set(s.id, await obtenerPanorama(s, info, log));
    log(`${s.id}: ${panos.get(s.id).ancho}×${panos.get(s.id).alto}, ${info.licencia}, ${info.autor}`);
  }
  const creditos = creditosFicha(t, encargo.scenes, infos);
  if (opts.dryRun) {
    console.log("\nCréditos de la ficha:\n" + creditos);
    console.log(`\nmeta.author: ${autorTour(t, infos)}`);
    log("Ensayo terminado: no se ha tocado la instancia");
    return;
  }

  // 2. Sesión
  let tilePanoramaNode;
  try {
    ({ tilePanoramaNode } = await import(TILER));
  } catch {
    throw new Error("Falta el tiler compilado: ejecuta `pnpm build:packages` en la raíz del repo");
  }
  const api = crearCliente(opts.base, opts.token);
  log(`Instancia ${opts.base} (${opts.token != null ? "token personal" : "sesión con contraseña"})`);
  if (opts.token == null) {
    if (opts.email == null || opts.password == null) throw new Error("Sin ANDARAMA_TOKEN hacen falta --email y --password");
    try {
      await api.call("/api/v1/auth/login", { method: "POST", body: { email: opts.email, password: opts.password } });
    } catch {
      log("El inicio de sesión falló; intentando registrar el usuario");
      await api.call("/api/v1/auth/register", { method: "POST", body: { email: opts.email, name: "Andarama Commons", password: opts.password } });
    }
  }
  const me = await api.call("/api/v1/me");
  if (me.user == null) throw new Error("La instancia no reconoce el token o la sesión");
  const org = opts.org != null ? me.orgs.find((o) => o.id === opts.org || o.slug === opts.org) : me.orgs[0];
  if (org == null) throw new Error("No se encontró la organización");
  log(`Organización: ${org.name}`);

  // 3. Medios
  const mediaIds = new Map();
  for (const s of encargo.scenes) mediaIds.set(s.id, await subirPanorama(api, tilePanoramaNode, org.id, panos.get(s.id), log));

  // 4. Proyecto (idempotente: se reutiliza el que ya publica este slug)
  const listado = await api.call(`/api/v1/projects?org=${encodeURIComponent(org.id)}`);
  const proyectos = Array.isArray(listado) ? listado : (listado.projects ?? []);
  let proyecto = proyectos.find((p) => p.publishedSlug === encargo.slug) ?? proyectos.find((p) => p.publishedSlug == null && p.title === encargo.title.trim());
  if (proyecto != null) {
    log(`Reutilizando el proyecto «${proyecto.title}» (${proyecto.id}); se reemplazan sus escenas`);
    await api.call(`/api/v1/projects/${proyecto.id}`, { method: "PATCH", body: { title: encargo.title.trim() } });
    const actual = await api.call(`/api/v1/projects/${proyecto.id}/scenes`);
    for (const h of actual.hotspots ?? []) await api.call(`/api/v1/projects/${proyecto.id}/hotspots/${h.id}`, { method: "DELETE" });
    for (const s of actual.scenes ?? []) await api.call(`/api/v1/projects/${proyecto.id}/scenes/${s.id}`, { method: "DELETE" });
  } else {
    log("Creando el proyecto");
    proyecto = await api.call("/api/v1/projects", { method: "POST", body: { orgId: org.id, title: encargo.title.trim(), defaultLang: encargo.lang } });
  }
  const projectId = proyecto.id;

  // 5. Escenas
  const sceneIds = new Map();
  for (const s of encargo.scenes) {
    const creada = await api.call(`/api/v1/projects/${projectId}/scenes`, { method: "POST", body: { title: s.title.trim(), mediaId: mediaIds.get(s.id) } });
    sceneIds.set(s.id, creada.id);
    const meta = { altText: s.alt.trim(), thumbnail: `thumb:${mediaIds.get(s.id)}` };
    if (!esTodo(s.desc)) meta.description = s.desc.trim();
    if (!esTodo(s.category)) meta.category = s.category.trim();
    await api.call(`/api/v1/projects/${projectId}/scenes/${creada.id}`, {
      method: "PATCH",
      body: { initialView: s.view ?? { yaw: 0, pitch: 0, fov: 1.2 }, meta },
    });
  }

  // 6. Navegación: los enlaces del encargo o, si no hay, un anillo (0 hacia
  //    la siguiente, π hacia la anterior)
  const titulo = (id) => encargo.scenes.find((s) => s.id === id).title.trim();
  let enlaces = encargo.links ?? [];
  if (enlaces.length === 0 && encargo.scenes.length > 1) {
    const n = encargo.scenes.length;
    enlaces = encargo.scenes.flatMap((s, i) => {
      const sig = encargo.scenes[(i + 1) % n].id;
      const ant = encargo.scenes[(i - 1 + n) % n].id;
      const salida = [{ from: s.id, to: sig, yaw: 0, pitch: -0.05, label: t.ir(titulo(sig)) }];
      if (n > 2 || i === 1) salida.push({ from: s.id, to: ant, yaw: Math.PI, pitch: -0.05, label: t.volver(titulo(ant)) });
      return salida;
    });
  }
  log(`${enlaces.length} hotspots de navegación`);
  for (const l of enlaces) {
    const label = typeof l.label === "string" && l.label !== "" ? l.label : t.ir(titulo(l.to));
    await api.call(`/api/v1/projects/${projectId}/scenes/${sceneIds.get(l.from)}/hotspots`, {
      method: "POST",
      body: { type: "navigation", position: { yaw: l.yaw, pitch: l.pitch }, content: { target: sceneIds.get(l.to), label, altText: label, entry: { mode: "lookBack" } } },
    });
  }

  // 7. Panel de créditos en la escena inicial (atribución completa, por escena)
  await api.call(`/api/v1/projects/${projectId}/scenes/${sceneIds.get(encargo.startScene)}/hotspots`, {
    method: "POST",
    body: {
      type: "text",
      position: { yaw: -1.2, pitch: -0.35 },
      content: { label: t.creditos, altText: t.creditos, title: t.sobre, body: panelCreditos(t, encargo.scenes, infos) },
    },
  });

  // 8. Ajustes del tour
  await api.call(`/api/v1/projects/${projectId}`, {
    method: "PATCH",
    body: {
      settings: {
        description: encargo.description.trim(),
        author: autorTour(t, infos),
        startScene: sceneIds.get(encargo.startScene),
        intro: "littlePlanet",
        autorotate: { enabled: true, speed: 0.045, delay: 8 },
        transition: { kind: "fade", duration: 900 },
        ui: { welcome: { enabled: false } },
      },
    },
  });

  // 9. Portada para la ficha: la imagen OG del panorama inicial (si cabe)
  let shareImage;
  try {
    const res = await api.call(`/api/v1/media/${mediaIds.get(encargo.startScene)}/derived/og`, { raw: true });
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    if (b64.length < 1_900_000) shareImage = `data:image/jpeg;base64,${b64}`;
  } catch {
    log("AVISO: no se pudo obtener la portada; la ficha saldrá sin cartel");
  }

  // 10. Publicar con la ficha de la galería
  const gallery = {
    enabled: true,
    title: encargo.title.trim(),
    description: encargo.description.trim(),
    credits: creditos,
    placeName: encargo.placeName.trim(),
    placeCountry: encargo.placeCountry.toUpperCase(),
    lang: encargo.lang,
  };
  if (encargo.lat != null) {
    gallery.lat = encargo.lat;
    gallery.lng = encargo.lng;
  }
  const pub = await api.call(`/api/v1/projects/${projectId}/publish`, {
    method: "POST",
    body: { slug: encargo.slug, visibility: "public", note: `Montado desde Wikimedia Commons (${basename(opts.encargo)})`, gallery, ...(shareImage != null ? { shareImage } : {}) },
  });
  log(`PUBLICADO: ${pub.url} (versión ${pub.version})`);
  if (pub.galleryUrl) log(`EN LA GALERÍA: ${pub.galleryUrl}`);
  if (pub.warnings?.length > 0) console.log("Avisos:", pub.warnings.map((w) => w.message).join(" | "));

  // 11. Comprobación de la ficha servida
  if (opts.verify && pub.galleryUrl) {
    const res = await fetch(pub.galleryUrl, { headers: { "user-agent": UA } });
    const html = await res.text();
    const ok = res.status === 200 && html.includes("application/ld+json") && html.includes(encargo.title.trim().replace(/&/g, "&amp;").slice(0, 40));
    log(`Ficha ${pub.galleryUrl}: ${res.status}${ok ? ", con título y JSON-LD" : " (AVISO: falta el título o el JSON-LD)"}`);
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
