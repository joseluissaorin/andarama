/**
 * Verificación del paquete exportado en condiciones de alojamiento básico.
 *
 * Exporta un tour publicado a un ZIP con el mismo código que usa el Studio,
 * lo descomprime y lo sirve con un servidor estático mínimo —sin cabeceras
 * especiales, sin reescrituras y desde un subdirectorio— para comprobar que
 * un hosting compartido cualquiera lo sirve tal cual.
 *
 * Uso: node scripts/verify-export.mjs [url-base] [slug]
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runExport, ZipWriter } from "../packages/exporter/dist/index.js";

const exec = promisify(execFile);
const BASE = process.argv[2] ?? "http://localhost:8788";
const SLUG = process.argv[3] ?? "campus-de-guajara";
const OUT = "/tmp/anda-export-check";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webmanifest": "application/manifest+json",
  ".md": "text/markdown; charset=utf-8",
};

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  console.log(`== Exportando ${BASE}/t/${SLUG}`);
  const tour = await (await fetch(`${BASE}/t/${SLUG}/tour.json`)).json();
  const map = await (await fetch(`${BASE}/t/${SLUG}/map.json`)).json().catch(() => ({ assets: {}, prefixes: {} }));

  // Assets: los que el compilador dejó mapeados en map.json
  const assetPaths = [...new Set([...Object.values(map.assets ?? {}), ...Object.values(map.prefixes ?? {})])]
    .filter((p) => typeof p === "string");
  const listed = [];
  // Miniaturas y otros assets referenciados directamente por el tour
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node != null && typeof node === "object") return Object.values(node).forEach(walk);
    if (typeof node === "string" && node.startsWith("a/") && !node.includes("/tiles/")) listed.push(node);
  };
  walk(tour);
  for (const scene of tour.scenes) {
    const src = scene.source;
    if (src.kind === "multires") {
      // Solo el nivel base: suficiente para verificar el servido de tiles
      for (const face of ["f", "b", "l", "r", "u", "d"]) {
        listed.push(`${src.base.replace(/\/$/, "")}/0/${face}/0/0.${src.extension ?? "webp"}`);
      }
    } else if (src.kind === "equirect" && src.url != null) {
      listed.push(src.url);
    }
  }

  const assets = {
    async list() {
      return listed;
    },
    async read(path) {
      const res = await fetch(`${BASE}/t/${SLUG}/${path}`);
      if (!res.ok) throw new Error(`${path}: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
  };

  // Igual que el Studio: files.json enumera el bundle y sus chunks perezosos
  const viewerList = await (await fetch(`${BASE}/viewer/files.json`)).json();
  const viewerFiles = [];
  for (const path of viewerList) {
    if (path.endsWith(".map")) continue; // los sourcemaps no se publican
    const res = await fetch(`${BASE}/viewer/${path}`);
    if (!res.ok) throw new Error(`viewer/${path}: ${res.status}`);
    viewerFiles.push({ path, data: new Uint8Array(await res.arrayBuffer()) });
  }
  console.log(`== Visor: ${viewerFiles.length} ficheros (bundle + chunks)`);

  const chunks = [];
  const writer = new ZipWriter((chunk) => { chunks.push(chunk); });
  const result = await runExport(tour, viewerFiles, assets, {}, writer);
  const zip = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const zipPath = join(OUT, "tour.zip");
  await writeFile(zipPath, zip);
  console.log(`== ZIP: ${result.files} ficheros, ${(zip.length / 1024 / 1024).toFixed(2)} MB`);

  // Descomprimir con la herramienta del sistema: valida que el ZIP es estándar
  const siteDir = join(OUT, "public", "tours", "mi-tour");
  await mkdir(siteDir, { recursive: true });
  await exec("unzip", ["-q", "-o", zipPath, "-d", siteDir]);
  console.log("== Descomprimido con unzip (formato ZIP válido)");

  for (const required of ["index.html", "tour.json", "viewer/viewer.js", ".htaccess", "LEEME.md"]) {
    await stat(join(siteDir, required));
  }
  console.log("== Contenido mínimo presente (incluye .htaccess y LEEME.md)");

  // La realidad virtual viaja dentro del paquete: el motor WebXR va en el
  // bundle (no es un chunk perezoso que se quedaría fuera) y el LEEME explica
  // que el modo inmersivo exige HTTPS.
  const { readFile } = await import("node:fs/promises");
  const bundle = await readFile(join(siteDir, "viewer", "viewer.js"), "utf8");
  if (!bundle.includes("immersive-vr") || !bundle.includes("hand-tracking")) {
    throw new Error("el paquete exportado no incluye el motor WebXR");
  }
  const leeme = await readFile(join(siteDir, "LEEME.md"), "utf8");
  if (!leeme.includes("HTTPS") || !leeme.includes("xr-spatial-tracking")) {
    throw new Error("el LEEME.md no documenta los requisitos de la VR");
  }
  console.log("== Motor WebXR presente en el bundle y requisitos documentados");

  // Servidor estático deliberadamente tonto: sin SPA fallback, sin cabeceras
  const root = join(OUT, "public");
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = normalize(join(root, url));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (url.endsWith("/")) file = join(file, "index.html");
    createReadStream(file)
      .on("error", () => res.writeHead(404, { "content-type": "text/plain" }).end("404"))
      .on("open", () => res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }))
      .pipe(res);
  });
  await new Promise((r) => server.listen(8799, r));
  console.log("== Sirviendo en http://localhost:8799/tours/mi-tour/ (hosting básico simulado)");
  return { server, dir: siteDir };
}

const { server } = await main();
console.log("Listo. Ctrl+C para parar.");
process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});
