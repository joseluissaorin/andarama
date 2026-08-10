#!/usr/bin/env node
/**
 * Siembra el tour de demostracion "Recorrido real 360" en una instancia de
 * Andarama usando la API publica y el tiler Node (el mismo camino que el
 * contenedor de procesado / automatizacion por CI).
 *
 * Uso:
 *   node scripts/seed-demo.mjs <base-url> <email> <password> <dir-panoramas>
 *
 * El directorio debe contener los JPG equirectangulares y un
 * atribuciones.json { "fichero.jpg": { title, artist, license, url } }.
 */
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tilePanoramaNode } from "../packages/tiler/dist/node/index.js";

const [base, email, password, dir] = process.argv.slice(2);
if (!base || !email || !password || !dir) {
  console.error("Uso: node scripts/seed-demo.mjs <base-url> <email> <password> <dir-panoramas>");
  process.exit(2);
}

let cookies = new Map();
let csrf = "";

function cookieHeader() {
  return [...cookies.values()].join("; ");
}

async function call(path, { method = "GET", body, raw = false, headers = {} } = {}) {
  const h = { ...headers, cookie: cookieHeader() };
  if (body != null && !(body instanceof Uint8Array)) {
    h["content-type"] = "application/json";
    body = JSON.stringify(body);
  }
  if (method !== "GET") h["x-csrf-token"] = csrf;
  const res = await fetch(base + path, { method, headers: h, body });
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(";");
    const name = pair.split("=")[0];
    cookies.set(name, pair);
    if (name === "u3c") csrf = pair.split("=")[1] ?? "";
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
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
  throw new Error(`PUT fallo: ${url.slice(0, 90)}`);
}

const log = (m) => console.log(`== ${m}`);

// ---------------------------------------------------------------------------
log(`Sesión en ${base}`);
try {
  await call("/api/v1/auth/login", { method: "POST", body: { email, password } });
} catch {
  log("Login fallo; intentando registro");
  await call("/api/v1/auth/register", { method: "POST", body: { email, name: "Demo Andarama", password } });
}
const me = await call("/api/v1/me");
const orgId = me.orgs[0].id;
log(`Organización: ${me.orgs[0].name}`);

const atrib = JSON.parse(await readFile(join(dir, "atribuciones.json"), "utf8"));

// ---------------------------------------------------------------------------
// Subida + tiling de cada panorama
async function uploadPanorama(filename) {
  const data = await readFile(join(dir, filename));
  const sha = Buffer.from(await crypto.subtle.digest("SHA-256", data)).toString("hex");

  const created = await call("/api/v1/media", {
    method: "POST",
    body: { orgId, kind: "panorama", filename, mime: "image/jpeg", bytes: data.length, sha256: sha },
  });
  if (created.deduplicated) {
    log(`${filename}: ya existia (dedup)`);
    return created.media.id;
  }
  const mediaId = created.media.id;
  log(`${filename}: subiendo original (${(data.length / 1024 / 1024).toFixed(1)} MB)`);
  await putUrl(created.upload.url, data, "image/jpeg");

  log(`${filename}: generando tiles`);
  const pending = [];
  let batch = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const items = batch;
    batch = [];
    const { urls } = await call(`/api/v1/media/${mediaId}/derivative-uploads`, {
      method: "POST",
      body: { keys: items.map((b) => b.key) },
    });
    // subir en paralelo controlado
    const queue = [...items];
    const workers = Array.from({ length: 8 }, async () => {
      for (;;) {
        const item = queue.shift();
        if (item == null) return;
        await putUrl(urls[item.key], item.data);
      }
    });
    await Promise.all(workers);
  };

  let count = 0;
  const result = await tilePanoramaNode(data, { format: "webp" }, async (tile) => {
    batch.push({ key: `tiles/${mediaId}/${tile.key}`, data: tile.data });
    count++;
    if (batch.length >= 100) {
      pending.push(flush());
      // limitar solapamiento de lotes
      if (pending.length % 3 === 0) await Promise.all(pending);
    }
  });
  await flush();
  await Promise.all(pending);
  log(`${filename}: ${count} tiles subidos`);

  const { urls } = await call(`/api/v1/media/${mediaId}/derivative-uploads`, {
    method: "POST",
    body: { keys: [`derived/${mediaId}/thumb.jpg`, `derived/${mediaId}/og.jpg`] },
  });
  await putUrl(urls[`derived/${mediaId}/thumb.jpg`], result.thumbnail, "image/jpeg");
  await putUrl(urls[`derived/${mediaId}/og.jpg`], result.ogImage, "image/jpeg");
  await call(`/api/v1/media/${mediaId}/derivatives`, { method: "POST", body: { kind: "tiles", manifest: result.manifest } });
  await call(`/api/v1/media/${mediaId}/derivatives`, { method: "POST", body: { kind: "thumb", manifest: {} } });
  await call(`/api/v1/media/${mediaId}/derivatives`, { method: "POST", body: { kind: "og", manifest: {} } });
  await call(`/api/v1/media/${mediaId}/complete`, {
    method: "POST",
    body: { width: result.sourceWidth, height: result.sourceHeight },
  });
  log(`${filename}: listo (${result.manifest.levels} niveles, cara ${result.manifest.faceSize}px)`);
  return mediaId;
}

const SCENES = [
  {
    file: "catedral-geisenheim.jpg",
    title: "Catedral de Geisenheim",
    category: "Interiores",
    alt: "Interior de la catedral neogótica de Geisenheim (Rheingauer Dom), con bóveda de crucería, bancos de madera y vidrieras al fondo",
    desc: "Rheingauer Dom, Geisenheim (Alemania). Vista esférica completa del interior.",
    view: { yaw: 0, pitch: 0.05, fov: 1.15 },
  },
  {
    file: "galeria-nacional-berlin.jpg",
    title: "Alte Nationalgalerie, Berlín",
    category: "Interiores",
    alt: "Sala de exposiciones de la Alte Nationalgalerie de Berlín con esculturas de mármol, columnas y paredes rojas con pinturas",
    desc: "Galería Nacional Antigua en la Isla de los Museos, Berlín.",
    view: { yaw: 0, pitch: 0, fov: 1.2 },
  },
  {
    file: "parque-industrial-duisburg.jpg",
    title: "Landschaftspark Duisburg-Nord",
    category: "Exteriores",
    alt: "Antiguo alto horno del parque paisajístico industrial de Duisburg-Nord, con estructuras de acero oxidado, tuberías y pasarelas",
    desc: "Patrimonio industrial reconvertido en parque, Duisburg (Alemania).",
    view: { yaw: 0, pitch: 0.08, fov: 1.25 },
  },
  {
    file: "san-diego.jpg",
    title: "Bahía de San Diego",
    category: "Exteriores",
    alt: "Paseo marítimo de la bahía de San Diego con palmeras, césped, rascacielos del centro y barcos amarrados",
    desc: "Embarcadero y skyline de San Diego, California.",
    view: { yaw: 0, pitch: 0, fov: 1.25 },
  },
];

const mediaIds = {};
for (const scene of SCENES) {
  mediaIds[scene.file] = await uploadPanorama(scene.file);
}

// ---------------------------------------------------------------------------
log("Creando proyecto");
const creditos = SCENES.map((s) => {
  const a = atrib[s.file];
  // Los titulos de Commons llevan parentesis: codificarlos para el enlace Markdown
  const url = a.url.replaceAll("(", "%28").replaceAll(")", "%29");
  return `- **${s.title}**: fotografía de ${a.artist}, [${a.license}](${url})`;
}).join("\n");

const project = await call("/api/v1/projects", {
  method: "POST",
  body: { orgId, title: "Recorrido real 360", defaultLang: "es" },
});
const projectId = project.id;

const sceneIds = {};
for (const scene of SCENES) {
  const created = await call(`/api/v1/projects/${projectId}/scenes`, {
    method: "POST",
    body: { title: scene.title, mediaId: mediaIds[scene.file] },
  });
  sceneIds[scene.file] = created.id;
  await call(`/api/v1/projects/${projectId}/scenes/${created.id}`, {
    method: "PATCH",
    body: {
      initialView: scene.view,
      meta: { altText: scene.alt, description: scene.desc, category: scene.category, thumbnail: `thumb:${mediaIds[scene.file]}` },
    },
  });
}

log("Hotspots de navegación y contenido");
const nav = async (fromFile, toFile, yaw, pitch, label) => {
  await call(`/api/v1/projects/${projectId}/scenes/${sceneIds[fromFile]}/hotspots`, {
    method: "POST",
    body: {
      type: "navigation",
      position: { yaw, pitch },
      content: { target: sceneIds[toFile], label, altText: label, entry: { mode: "lookBack" } },
    },
  });
};
// Recorrido circular con posiciones elegidas a mano sobre cada panorama
await nav("catedral-geisenheim.jpg", "galeria-nacional-berlin.jpg", 2.6, -0.05, "Ir a la Alte Nationalgalerie");
await nav("galeria-nacional-berlin.jpg", "catedral-geisenheim.jpg", -2.4, -0.06, "Volver a la catedral");
await nav("galeria-nacional-berlin.jpg", "parque-industrial-duisburg.jpg", 1.1, -0.04, "Salir al parque industrial");
await nav("parque-industrial-duisburg.jpg", "galeria-nacional-berlin.jpg", -2.0, -0.05, "Volver al museo");
await nav("parque-industrial-duisburg.jpg", "san-diego.jpg", 0.9, -0.02, "Viajar a San Diego");
await nav("san-diego.jpg", "parque-industrial-duisburg.jpg", -2.6, -0.03, "Volver a Duisburg");
await nav("san-diego.jpg", "catedral-geisenheim.jpg", 2.2, -0.02, "Volver al inicio");

// Panel de bienvenida con creditos CC BY-SA
await call(`/api/v1/projects/${projectId}/scenes/${sceneIds["catedral-geisenheim.jpg"]}/hotspots`, {
  method: "POST",
  body: {
    type: "text",
    position: { yaw: -0.9, pitch: -0.05 },
    content: {
      label: "Sobre este recorrido",
      altText: "Información y créditos del recorrido",
      title: "Recorrido real 360",
      body: `## Cuatro lugares reales, un solo visor\n\nEste tour de demostración de **Andarama** usa fotografías esféricas reales de Wikimedia Commons:\n\n${creditos}\n\nMuévete con el ratón o el dedo, entra por las flechas y prueba el menú de escenas, la brújula, las proyecciones y el modo VR.`,
    },
    style: { pulse: true },
  },
});

// Quiz en la ultima escena
await call(`/api/v1/projects/${projectId}/scenes/${sceneIds["san-diego.jpg"]}/hotspots`, {
  method: "POST",
  body: {
    type: "quiz",
    position: { yaw: 0.5, pitch: -0.25 },
    content: {
      label: "Pregunta del recorrido",
      altText: "Pregunta sobre el recorrido",
      question: "Tres de los cuatro lugares de este recorrido están en el mismo país. ¿Cuál?",
      kind: "single",
      options: [
        { id: "de", text: "Alemania", correct: true },
        { id: "us", text: "Estados Unidos" },
        { id: "es", text: "España" },
      ],
      feedbackCorrect: "Correcto: la catedral de Geisenheim, la Alte Nationalgalerie y el parque de Duisburg-Nord están en Alemania.",
      feedbackWrong: "Casi: revisa los títulos de las escenas en el menú.",
      points: 1,
    },
  },
});

log("Ajustes del tour y publicación");
await call(`/api/v1/projects/${projectId}`, {
  method: "PATCH",
  body: {
    settings: {
      description: "Recorrido de demostración con fotografías esféricas reales (Wikimedia Commons, CC BY-SA).",
      startScene: sceneIds["catedral-geisenheim.jpg"],
      intro: "littlePlanet",
      autorotate: { enabled: true, speed: 0.045, delay: 8 },
      transition: { kind: "fade", duration: 900 },
      ui: { theme: { base: "ull" }, welcome: { enabled: false } },
    },
  },
});

const pub = await call(`/api/v1/projects/${projectId}/publish`, {
  method: "POST",
  body: { slug: "recorrido-real", visibility: "public", note: "Demo con fotografias reales" },
});
log(`PUBLICADO: ${pub.url}`);
if (pub.warnings?.length > 0) console.log("Avisos:", pub.warnings.map((w) => w.message).join(" | "));
