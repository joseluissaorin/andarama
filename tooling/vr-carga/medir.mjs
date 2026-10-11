#!/usr/bin/env node
/**
 * Medición de la carga de escenas en el modo VR (WebXR simulado).
 *
 *   node tooling/vr-carga/medir.mjs [--bundle packages/viewer-ui/dist/bundle]
 *        [--8k] [--cpu 4] [--red 30] [--etiqueta nombre]
 *
 * Trocea los panoramas de examples/panoramas con el tiler de Node (con --8k,
 * reescalados a 8192 × 4096, como los de una cámara 360 actual), monta un
 * tour de tres escenas encadenadas, lo sirve con el bundle indicado y, en
 * Chromium con un `navigator.xr` falso, entra en VR y salta a → b → c → a
 * mirando cada escena unos segundos, como haría una persona.
 *
 * De cada salto se mide, desde que se pide:
 * - «visible»: el primer fotograma con la escena nueva aplicada (fin del negro);
 * - «definitiva»: la última subida de textura del entorno (ya no mejora más);
 * - la densidad final en píxeles por grado.
 *
 * Mide subidas a la GPU (texImage2D / texSubImage2D), no detalles internos
 * del motor: sirve igual para el código de antes y el de después.
 * --cpu ralentiza la CPU (4 ≈ un visor autónomo frente a un portátil) y --red
 * limita la red a esos Mbit/s con 40 ms de latencia.
 */
import { createServer } from "node:http";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const bundleDir = resolve(opt("bundle", join(root, "packages/viewer-ui/dist/bundle")));
const big = flag("8k");
const cpu = Number(opt("cpu", "4"));
const mbps = Number(opt("red", "30"));
const etiqueta = opt("etiqueta", "");
const DWELL_MS = Number(opt("mirar", "4000"));

const require = createRequire(join(root, "packages/tiler/package.json"));
const sharp = require("sharp");
const { tilePanoramaNode } = await import(join(root, "packages/tiler/dist/node/index.js"));
const { chromium } = await import(createRequire(join(root, "package.json")).resolve("@playwright/test")).then((m) => m.default ?? m);

// --- Datos: tres escenas troceadas -------------------------------------------
const fixtures = join(tmpdir(), `andarama-vr-carga-${big ? "8k" : "4k"}`);
const nombres = ["entrada-campus", "pasillo-central", "aula-magna"];
const ids = ["a", "b", "c"];
const fuentes = [];
for (const [i, nombre] of nombres.entries()) {
  const dir = join(fixtures, "tiles", ids[i]);
  const manifestPath = join(dir, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    let input = join(root, "examples/panoramas", `${nombre}.jpg`);
    if (big) input = await sharp(input).resize(8192, 4096).jpeg({ quality: 88 }).toBuffer();
    const result = await tilePanoramaNode(input, { format: "webp" }, async (tile) => {
      const file = join(dir, tile.key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, tile.data);
    });
    manifest = result.manifest;
    await writeFile(manifestPath, JSON.stringify(manifest));
  }
  fuentes.push(manifest);
}
const tour = {
  version: 1,
  meta: { title: { es: "Medición VR" }, defaultLang: "es", langs: ["es"] },
  start: { scene: "a" },
  scenes: ids.map((id, i) => ({
    id,
    type: "image",
    title: { es: `Escena ${id}` },
    source: {
      kind: "multires",
      levels: fuentes[i].levels,
      tileSize: fuentes[i].tileSize,
      faceSize: fuentes[i].faceSize,
      extension: fuentes[i].extension,
      base: `tiles/${id}`,
      preview: fuentes[i].preview,
    },
    hotspots: [
      { id: `${id}-sig`, type: "navigation", yaw: 0.3, pitch: 0.1, target: ids[(i + 1) % 3], label: { es: "Siguiente" } },
      { id: `${id}-ant`, type: "navigation", yaw: -0.3, pitch: 0.1, target: ids[(i + 2) % 3], label: { es: "Anterior" } },
    ],
  })),
};
await writeFile(join(fixtures, "tour.json"), JSON.stringify(tour));
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>VR</title>
<style>html,body,#andarama{margin:0;width:100%;height:100%;}</style></head>
<body><div id="andarama" data-tour="/t/tour.json" data-base="/t/"></div>
<script type="module" src="/viewer/viewer.js"></script></body></html>`;

// --- Servidor estático -----------------------------------------------------------
const tipos = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".jpg": "image/jpeg", ".css": "text/css", ".html": "text/html" };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = null;
  if (path === "/" || path === "/index.html") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
    return;
  }
  if (path.startsWith("/viewer/")) file = join(bundleDir, path.slice(8));
  else if (path.startsWith("/t/")) file = join(fixtures, path.slice(3));
  try {
    if (file == null || !(await stat(file)).isFile()) throw new Error("404");
    // Como en producción: las teselas se cachean (contenido inmutable)
    res.writeHead(200, { "content-type": tipos[extname(file)] ?? "application/octet-stream", "cache-control": "public, max-age=3600" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;

// --- Navegador con WebXR simulado y registro de subidas ------------------------
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const cdp = await page.context().newCDPSession(page);
if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
if (mbps > 0) {
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 40,
    downloadThroughput: (mbps * 1024 * 1024) / 8,
    uploadThroughput: (10 * 1024 * 1024) / 8,
  });
}
await page.addInitScript(() => {
  const log = [];
  const phases = [];
  window.__vrLog = { log, phases };
  // Lienzos de la interfaz (iconos, retículo, panel, aviso): no son el entorno
  const UI = new Set(["256x256", "128x128", "1280x800", "1024x256"]);
  const dims = (s) => [s?.naturalWidth || s?.videoWidth || s?.width || 0, s?.naturalHeight || s?.videoHeight || s?.height || 0];
  const proto = WebGLRenderingContext.prototype;
  const tex = proto.texImage2D;
  proto.texImage2D = function (...a) {
    // Solo el contexto del modo inmersivo (el que se hace compatible con XR)
    if (this.__xr !== true) return tex.apply(this, a);
    const t0 = performance.now();
    const r = tex.apply(this, a);
    const t1 = performance.now();
    if (a.length >= 9) {
      if (a[8] == null && a[3] >= 1024) log.push({ t: t1, kind: "alloc", w: a[3], h: a[4], ms: t1 - t0 });
    } else {
      const [w, h] = dims(a[5]);
      const ui = a[5] instanceof HTMLCanvasElement && UI.has(`${w}x${h}`);
      if (!ui && w > 0) log.push({ t: t1, kind: "image", w, h, ms: t1 - t0 });
    }
    return r;
  };
  const sub = proto.texSubImage2D;
  proto.texSubImage2D = function (...a) {
    if (this.__xr !== true) return sub.apply(this, a);
    const t0 = performance.now();
    const r = sub.apply(this, a);
    const t1 = performance.now();
    const [w, h] = dims(a[6]);
    log.push({ t: t1, kind: "tile", w, h, ms: t1 - t0 });
    return r;
  };
  // navigator.xr de un visor autónomo, mínimo
  const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const projection = new Float32Array([1.19, 0, 0, 0, 0, 1.73, 0, 0, 0, 0, -1.0008, -1, 0, 0, -0.1, 0]);
  let frames = 0;
  let lastPhase = null;
  let longest = 0;
  let prev = 0;
  class FakeSession extends EventTarget {
    inputSources = [];
    renderState = {};
    updateRenderState(s) {
      this.renderState = { ...this.renderState, ...s };
    }
    async requestReferenceSpace() {
      return {};
    }
    requestAnimationFrame(cb) {
      return nativeRaf((t) => {
        frames++;
        if (prev > 0) longest = Math.max(longest, t - prev);
        prev = t;
        cb(t, {
          session: this,
          getViewerPose: () => ({
            transform: { matrix: identity() },
            views: [
              { eye: "left", projectionMatrix: projection, transform: { inverse: { matrix: identity() } } },
              { eye: "right", projectionMatrix: projection, transform: { inverse: { matrix: identity() } } },
            ],
          }),
          getPose: () => null,
        });
        const vr = window.Andarama?.instance?.viewer?.vr;
        const phase = vr?.transition?.phase ?? null;
        if (phase !== lastPhase) {
          phases.push({ t: performance.now(), phase });
          lastPhase = phase;
        }
      });
    }
    async end() {
      inSession = false;
      this.dispatchEvent(new Event("end"));
    }
  }
  const session = new FakeSession();
  // Como en Meta Quest: durante la sesión inmersiva, el requestAnimationFrame
  // de la ventana se para (el visor plano no compite por la CPU).
  const nativeRaf = window.requestAnimationFrame.bind(window);
  let inSession = false;
  window.requestAnimationFrame = (cb) => (inSession ? 0 : nativeRaf(cb));
  window.__vrFrames = () => ({ frames, longest });
  window.__vrResetLongest = () => {
    longest = 0;
  };
  window.XRWebGLLayer = class {
    framebuffer = null;
    getViewport(v) {
      return { x: v.eye === "right" ? 640 : 0, y: 0, width: 640, height: 800 };
    }
  };
  WebGLRenderingContext.prototype.makeXRCompatible = async function () {
    this.__xr = true;
  };
  Object.defineProperty(navigator, "xr", {
    configurable: true,
    value: {
      isSessionSupported: async () => true,
      requestSession: async () => {
        inSession = true;
        return session;
      },
      addEventListener() {},
    },
  });
});

await page.goto(base);
await page.waitForFunction(() => window.Andarama?.instance?.viewer != null, null, { timeout: 60_000 });
await page.waitForTimeout(1500);
const now = () => page.evaluate(() => performance.now());

/** Espera a que no haya subidas del entorno en `quiet` ms (tope `max`). */
async function quiescence(desde, quiet = 2500, max = 60_000) {
  const inicio = Date.now();
  for (;;) {
    const { last, t } = await page.evaluate((d) => {
      const env = window.__vrLog.log.filter((e) => e.t >= d && e.kind !== "alloc");
      return { last: env.length > 0 ? env[env.length - 1].t : d, t: performance.now() };
    }, desde);
    if (t - last > quiet || Date.now() - inicio > max) return;
    await page.waitForTimeout(250);
  }
}

async function medir(nombre, accion) {
  await page.evaluate(() => window.__vrResetLongest());
  const t0 = await now();
  await page.evaluate(accion);
  await quiescence(t0);
  const r = await page.evaluate((d) => {
    const { log, phases } = window.__vrLog;
    const env = log.filter((e) => e.t >= d);
    const subidas = env.filter((e) => e.kind !== "alloc");
    const visible = phases.find((p) => p.t >= d && (p.phase === "in" || p.phase === "idle"));
    const allocs = env.filter((e) => e.kind === "alloc");
    const equirect = subidas.filter((e) => e.kind === "image" && e.w >= 2 * e.h - 2 && e.w >= 1024);
    // Densidad final: cara de cubo (90°) o equirectangular (360°)
    const pxPorGrado = allocs.length > 0 ? Math.max(...allocs.map((a) => a.w)) / 90 : equirect.length > 0 ? Math.max(...equirect.map((e) => e.w)) / 360 : 0;
    return {
      visible: visible != null ? visible.t - d : null,
      definitiva: subidas.length > 0 ? subidas[subidas.length - 1].t - d : null,
      subidas: subidas.length,
      msGpu: subidas.reduce((a, e) => a + e.ms, 0),
      pxPorGrado,
      peorFotograma: window.__vrFrames().longest,
    };
  }, t0);
  return { nombre, ...r };
}

const resultados = [];
resultados.push(await medir("entrar en VR (a)", () => window.Andarama.instance.viewer.enterVr()));
for (const [desde, hacia] of [
  ["a", "b"],
  ["b", "c"],
  ["c", "a"],
]) {
  await page.waitForTimeout(DWELL_MS);
  resultados.push(await medir(`${desde} → ${hacia}`, `window.Andarama.instance.viewer.vr.navigate(${JSON.stringify(hacia)})`));
}
await browser.close();
server.close();

const f = (v) => (v == null ? "—" : `${Math.round(v)}`);
console.log(`\n${etiqueta !== "" ? `[${etiqueta}] ` : ""}${big ? "8192×4096" : "4096×2048"} · CPU ×${cpu} · red ${mbps} Mbit/s · ${DWELL_MS} ms mirando cada escena`);
console.log("salto              visible(ms)  definitiva(ms)  subidas  GPU(ms)  px/°   peor fotograma(ms)");
for (const r of resultados) {
  console.log(
    `${r.nombre.padEnd(18)} ${f(r.visible).padStart(11)}  ${f(r.definitiva).padStart(14)}  ${String(r.subidas).padStart(7)}  ${f(r.msGpu).padStart(7)}  ${r.pxPorGrado.toFixed(1).padStart(5)}  ${f(r.peorFotograma).padStart(18)}`,
  );
}
if (flag("json")) console.log(JSON.stringify(resultados));
