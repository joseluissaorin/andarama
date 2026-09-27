#!/usr/bin/env node
/**
 * Monta y publica una plantilla por sector (escape room, PRL, museo,
 * campus...) a partir de un guion en JS con panorámicas libres de Wikimedia
 * Commons. Reutiliza la descarga, la subida y el teselado de
 * montar-monumento.mjs; lo que añade es lo que un monumento no lleva:
 * hotspots de cualquier tipo (quiz, tesoro, estado, formulario...),
 * condiciones sobre variables, traducciones y ajustes del tour (quiz,
 * pantallas de bienvenida y final, recorrido automático, mapa).
 *
 * Uso:
 *   ANDARAMA_TOKEN=andarama_... ANDARAMA_ORG=<id> node tooling/commons/montar-plantilla.mjs tooling/commons/plantillas/{guion}.mjs
 *
 * El guion exporta por defecto un objeto con:
 *   slug, title (L10n), description (L10n), lang, langs, start (clave de escena),
 *   scenes: [{ key, commonsPage, title, alt, desc (L10n), look: [u, v],
 *              map?: {lat, lng}, hotspots: [{ key?, type, at: [u, v], content, conditions?, style? }] }],
 *   settings: ajustes del tour (se admiten "@scene:clave" y "@hs:clave"),
 *   creditsAt?: [u, v] del panel de créditos en la escena inicial,
 *   creditsNote?: L10n que se añade al panel de créditos.
 *
 * L10n es un texto o un objeto { es, en, de }. En escenas y hotspots el
 * idioma principal va al campo y el resto a la tabla de traducciones, que es
 * lo que edita el Studio; en los ajustes los objetos se guardan tal cual.
 * Las posiciones van en fracciones de la imagen equirectangular: u de 0 a 1
 * de izquierda a derecha y v de 0 (cenit) a 1 (nadir).
 *
 * Es idempotente: si la organización ya tiene un proyecto con ese título, se
 * vacían sus escenas y se vuelven a crear, y se publica una versión nueva.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CACHE, TILER, crearCliente, metadatosCommons, obtenerPanorama, subirPanorama } from "./montar-monumento.mjs";

const aYaw = (u) => (u - 0.5) * 2 * Math.PI;
const aPitch = (v) => (v - 0.5) * Math.PI;
const pos = ([u, v]) => ({ yaw: +aYaw(u).toFixed(4), pitch: +aPitch(v).toFixed(4) });

const esMapa = (x) => x != null && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length > 0 && Object.keys(x).every((k) => /^[a-z]{2}(-[A-Za-z]+)?$/.test(k)) && Object.values(x).every((v) => typeof v === "string");

/** Separa un valor con mapas L10n: el idioma principal queda en el valor; el resto, en traducciones con su ruta. */
function separar(valor, lang, ruta = [], trad = []) {
  if (esMapa(valor)) {
    for (const [l, t] of Object.entries(valor)) if (l !== lang) trad.push({ lang: l, field: ruta.join("."), value: t });
    return { valor: valor[lang] ?? Object.values(valor)[0], trad };
  }
  if (Array.isArray(valor)) return { valor: valor.map((v, i) => separar(v, lang, [...ruta, String(i)], trad).valor), trad };
  if (valor != null && typeof valor === "object") {
    const out = {};
    for (const [k, v] of Object.entries(valor)) out[k] = separar(v, lang, [...ruta, k], trad).valor;
    return { valor: out, trad };
  }
  return { valor, trad };
}

/** Sustituye "@scene:clave" y "@hs:clave" por los ids reales. */
function referencias(valor, escenas, hotspots) {
  if (typeof valor === "string") {
    const m = /^@(scene|hs):(.+)$/.exec(valor);
    if (m == null) return valor;
    const id = (m[1] === "scene" ? escenas : hotspots).get(m[2]);
    if (id == null) throw new Error(`Referencia sin resolver: ${valor}`);
    return id;
  }
  if (Array.isArray(valor)) return valor.map((v) => referencias(v, escenas, hotspots));
  if (valor != null && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, referencias(v, escenas, hotspots)]));
  return valor;
}

const CREDITOS = {
  es: { label: "Créditos", title: "Sobre este recorrido", foto: "fotografía", cuerpo: "Las fotografías esféricas proceden de Wikimedia Commons y se usan con su licencia libre:" },
  en: { label: "Credits", title: "About this tour", foto: "photograph", cuerpo: "The spherical photographs come from Wikimedia Commons and are used under their free licences:" },
  de: { label: "Bildnachweis", title: "Über diese Tour", foto: "Foto", cuerpo: "Die Kugelpanoramen stammen aus Wikimedia Commons und werden unter ihrer freien Lizenz verwendet:" },
};

function panelCreditos(guion, infos) {
  const out = { label: {}, altText: {}, title: {}, body: {} };
  for (const l of guion.langs) {
    const t = CREDITOS[l] ?? CREDITOS.en;
    const lineas = guion.scenes.map((s) => {
      const i = infos.get(s.key);
      const url = i.pagina.replaceAll("(", "%28").replaceAll(")", "%29");
      const lic = i.licenciaUrl != null ? `[${i.licencia}](${i.licenciaUrl})` : i.licencia;
      const titulo = typeof s.title === "string" ? s.title : (s.title[l] ?? s.title[guion.lang]);
      return `- **${titulo}**: ${t.foto} ${i.autor}, ${lic}, [Wikimedia Commons](${url})`;
    });
    const nota = guion.creditsNote == null ? "" : `\n\n${typeof guion.creditsNote === "string" ? guion.creditsNote : (guion.creditsNote[l] ?? "")}`;
    out.label[l] = t.label;
    out.altText[l] = t.label;
    out.title[l] = t.title;
    out.body[l] = `${t.cuerpo}\n\n${lineas.join("\n")}${nota}`;
  }
  return out;
}

async function main() {
  const ruta = process.argv[2];
  if (ruta == null) {
    console.error("Uso: node tooling/commons/montar-plantilla.mjs <guion.mjs>");
    process.exit(2);
  }
  const guion = (await import(pathToFileURL(resolve(ruta)).href)).default;
  const base = (process.env.ANDARAMA_BASE ?? "https://app.andarama.com").replace(/\/$/, "");
  const token = process.env.ANDARAMA_TOKEN;
  const orgId = process.env.ANDARAMA_ORG;
  if (token == null || orgId == null) throw new Error("Hacen falta ANDARAMA_TOKEN y ANDARAMA_ORG");
  const log = (m) => console.log(`== ${m}`);
  const L = guion.lang;
  const txt = (x) => (typeof x === "string" ? x : x[L]);
  await mkdir(CACHE, { recursive: true });

  // 1. Commons
  const infos = new Map();
  const panos = new Map();
  for (const s of guion.scenes) {
    const info = await metadatosCommons(s.commonsPage);
    if (s.author) info.autor = s.author;
    infos.set(s.key, info);
    panos.set(s.key, await obtenerPanorama({ id: s.key, file: s.file }, info, log));
    log(`${s.key}: ${info.licencia}, ${info.autor}`);
  }

  // 2. Medios
  const { tilePanoramaNode } = await import(TILER);
  const api = crearCliente(base, token);
  const mediaIds = new Map();
  for (const s of guion.scenes) mediaIds.set(s.key, await subirPanorama(api, tilePanoramaNode, orgId, panos.get(s.key), log));

  // 3. Proyecto (idempotente por título)
  const titulo = txt(guion.title);
  const listado = await api.call(`/api/v1/projects?org=${encodeURIComponent(orgId)}`);
  const proyectos = Array.isArray(listado) ? listado : (listado.projects ?? []);
  let proyecto = proyectos.find((p) => p.publishedSlug === guion.slug) ?? proyectos.find((p) => p.title === titulo);
  if (proyecto != null) {
    log(`Reutilizando «${proyecto.title}» (${proyecto.id})`);
    await api.call(`/api/v1/projects/${proyecto.id}`, { method: "PATCH", body: { title: titulo } });
    const actual = await api.call(`/api/v1/projects/${proyecto.id}/scenes`);
    for (const h of actual.hotspots ?? []) await api.call(`/api/v1/projects/${proyecto.id}/hotspots/${h.id}`, { method: "DELETE" });
    for (const s of actual.scenes ?? []) await api.call(`/api/v1/projects/${proyecto.id}/scenes/${s.id}`, { method: "DELETE" });
  } else {
    proyecto = await api.call("/api/v1/projects", { method: "POST", body: { orgId, title: titulo, defaultLang: L } });
    log(`Proyecto creado (${proyecto.id})`);
  }
  const pid = proyecto.id;
  // Los ajustes se escriben enteros más abajo; aquí solo el idioma, para que
  // el compilador sepa cuál es el principal al leer las traducciones
  await api.call(`/api/v1/projects/${pid}`, { method: "PATCH", body: { settings: { defaultLang: L, langs: guion.langs } } });

  // 4. Escenas (primero todas, para poder enlazarlas)
  const escenas = new Map();
  const traducciones = new Map(guion.langs.filter((l) => l !== L).map((l) => [l, []]));
  const anotar = (entity, entityId, trad) => {
    for (const t of trad) traducciones.get(t.lang)?.push({ entity, entityId, field: t.field, value: t.value });
  };
  for (const s of guion.scenes) {
    const creada = await api.call(`/api/v1/projects/${pid}/scenes`, { method: "POST", body: { title: txt(s.title), mediaId: mediaIds.get(s.key) } });
    escenas.set(s.key, creada.id);
    const campos = separar({ title: s.title, altText: s.alt, description: s.desc }, L);
    anotar("scene", creada.id, campos.trad);
    const [u, v] = s.look ?? [0.5, 0.5];
    await api.call(`/api/v1/projects/${pid}/scenes/${creada.id}`, {
      method: "PATCH",
      body: {
        initialView: { yaw: +aYaw(u).toFixed(4), pitch: +aPitch(v).toFixed(4), fov: s.fov ?? 1.3 },
        meta: { altText: campos.valor.altText, description: campos.valor.description, thumbnail: `thumb:${mediaIds.get(s.key)}` },
        ...(s.map != null ? { map: s.map } : {}),
      },
    });
  }

  // 5. Hotspots (el panel de créditos, en la escena inicial)
  const hotspots = new Map();
  const inicio = guion.start ?? guion.scenes[0].key;
  const todos = guion.scenes.flatMap((s) => (s.hotspots ?? []).map((h) => ({ ...h, escena: s.key })));
  todos.push({ escena: inicio, type: "text", at: guion.creditsAt ?? [0.5, 0.78], content: panelCreditos(guion, infos), style: { icon: { name: "info" } } });
  let n = 0;
  for (const h of todos) {
    const contenido = separar(referencias(h.content ?? {}, escenas, hotspots), L);
    const creado = await api.call(`/api/v1/projects/${pid}/scenes/${escenas.get(h.escena)}/hotspots`, {
      method: "POST",
      body: {
        type: h.type,
        position: pos(h.at),
        content: contenido.valor,
        ...(h.style != null ? { style: h.style } : {}),
        ...(h.conditions != null ? { conditions: h.conditions } : {}),
        sort: n++,
      },
    });
    if (h.key != null) hotspots.set(h.key, creado.id);
    anotar("hotspot", creado.id, contenido.trad);
  }
  log(`${todos.length} hotspots`);

  // 6. Traducciones (título y descripción del tour incluidos)
  const tour = separar({ title: guion.title, description: guion.description }, L);
  anotar("tour", "meta", tour.trad);
  for (const [lang, entradas] of traducciones) {
    if (entradas.length > 0) await api.call(`/api/v1/projects/${pid}/translations/${lang}`, { method: "PUT", body: entradas });
    log(`${lang}: ${entradas.length} traducciones`);
  }

  // 7. Ajustes
  const settings = referencias(
    { ...guion.settings, description: tour.valor.description, startScene: `@scene:${inicio}`, defaultLang: L, langs: guion.langs },
    escenas,
    hotspots,
  );
  await api.call(`/api/v1/projects/${pid}`, { method: "PATCH", body: { settings } });

  // 8. Publicar
  let shareImage;
  try {
    const res = await api.call(`/api/v1/media/${mediaIds.get(inicio)}/derived/og`, { raw: true });
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    if (b64.length < 1_900_000) shareImage = `data:image/jpeg;base64,${b64}`;
  } catch {
    log("AVISO: sin portada");
  }
  const pub = await api.call(`/api/v1/projects/${pid}/publish`, {
    method: "POST",
    body: { slug: guion.slug, visibility: "public", note: `Plantilla montada con montar-plantilla.mjs`, ...(guion.gallery != null ? { gallery: guion.gallery } : {}), ...(shareImage != null ? { shareImage } : {}) },
  });
  if (pub.warnings?.length > 0) console.log("Avisos:", pub.warnings.map((w) => w.message).join(" | "));
  console.log(JSON.stringify({ projectId: pid, url: pub.url, version: pub.version }));
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
