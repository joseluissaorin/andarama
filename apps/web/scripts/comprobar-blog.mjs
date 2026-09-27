#!/usr/bin/env node
/**
 * Comprobaciones de los artículos del blog: recuento de palabras, frontmatter,
 * ortotipografía (rayas con espacios) y enlaces internos contra `dist` y
 * contra la documentación (`apps/docs/src/content/docs`).
 *
 *   node apps/web/scripts/comprobar-blog.mjs [es]
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { esEnlaceSinPublicar, slugsSinPublicar } from "./blog-publicado.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lang = process.argv[2] ?? "es";
const dirBlog = join(raiz, "src/content/blog", lang);
const dist = join(raiz, "dist");
const docs = resolve(raiz, "../docs/src/content/docs");
// Los artículos con fecha futura no se construyen, y los enlaces hacia ellos se
// quedan en texto (plugin de remark): ni se buscan en dist ni cuentan como error
const sinPublicar = slugsSinPublicar(join(raiz, "src/content/blog"));

const RAYA = "\u2014";
const SEMIRRAYA = "\u2013";

let errores = 0;
const error = (f, msg) => {
  errores++;
  console.log(`  ✗ ${f}: ${msg}`);
};

function frontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  return { fm: m[1], body: m[2] };
}

function campo(fm, nombre) {
  const m = fm.match(new RegExp(`^${nombre}:\\s*(.*)$`, "m"));
  return m ? m[1].trim().replace(/^"(.*)"$/, "$1") : null;
}

/**
 * Páginas de destino que está construyendo otro frente (precios, verticales).
 * Mientras no existan en `dist`, un enlace a ellas es un aviso y no un error.
 */
const PENDIENTES = new Set(["/precios/", "/en/pricing/", "/inmobiliaria/", "/en/real-estate/"]);

function existeRuta(path) {
  const limpio = path.replace(/[#?].*$/, "");
  const candidatos = [join(dist, limpio, "index.html"), join(dist, limpio)];
  return candidatos.some((c) => existsSync(c) && statSync(c).isFile());
}

function existeDoc(path) {
  const limpio = path.replace(/^https:\/\/docs\.andarama\.com/, "").replace(/[#?].*$/, "").replace(/\/$/, "");
  if (limpio === "") return existsSync(join(docs, "index.md"));
  return existsSync(join(docs, `${limpio}.md`)) || existsSync(join(docs, limpio, "index.md"));
}

const ficheros = readdirSync(dirBlog).filter((f) => f.endsWith(".md")).sort();
let totalPalabras = 0;
console.log(`Artículos en ${lang}: ${ficheros.length}\n`);
for (const f of ficheros) {
  const src = readFileSync(join(dirBlog, f), "utf8");
  const parsed = frontmatter(src);
  if (!parsed) {
    error(f, "sin frontmatter");
    continue;
  }
  const { fm, body } = parsed;
  const cuerpo = body.replace(/```[\s\S]*?```/g, "");
  const palabras = cuerpo.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  totalPalabras += palabras;
  const faqs = (fm.match(/^\s+- q:/gm) ?? []).length;
  const slug = campo(fm, "slug");
  const desc = campo(fm, "description") ?? "";
  const fecha = campo(fm, "fecha");
  console.log(`${f}: ${palabras} palabras · ${faqs} FAQ · ${fecha} · desc ${desc.length}${sinPublicar.has(slug) ? " · sin publicar" : ""}`);

  if (slug !== f.replace(/\.md$/, "")) error(f, `slug «${slug}» no coincide con el fichero`);
  if (desc.length > 155) error(f, `description de ${desc.length} caracteres (máx. 155)`);
  if (desc.length === 0) error(f, "sin description");
  if (!campo(fm, "cluster")) error(f, "sin cluster");
  if (campo(fm, "lang") !== lang) error(f, "lang incorrecto");
  if (campo(fm, "autor") !== "jose-luis-saorin") error(f, "autor incorrecto");
  if (palabras < 900 || palabras > 1500) error(f, `${palabras} palabras (fuera de 900–1500)`);
  if (faqs < 3) console.log(`  · aviso: ${f} tiene ${faqs} preguntas frecuentes (se recomiendan 3 o 4)`);

  // Ortotipografía: rayas con espacios a ambos lados, semirrayas, comillas inglesas tipográficas
  const lineas = src.split("\n");
  lineas.forEach((l, i) => {
    if (l.includes(` ${RAYA} `) || l.startsWith(`${RAYA} `) || l.endsWith(` ${RAYA}`)) error(f, `raya con espacios en la línea ${i + 1}`);
    if (l.includes(SEMIRRAYA)) error(f, `semirraya en la línea ${i + 1}`);
    if (/[\u201c\u201d]/.test(l)) error(f, `comillas inglesas tipográficas en la línea ${i + 1}`);
  });

  // Enlaces
  const enlaces = [...src.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  for (const e of enlaces) {
    if (e.startsWith("/")) {
      if (!existeRuta(e) && !esEnlaceSinPublicar(e, sinPublicar)) {
        if (PENDIENTES.has(e.replace(/[#?].*$/, ""))) console.log(`  · aviso: ${f} enlaza a ${e}, página pendiente de otro frente`);
        else error(f, `enlace interno sin destino en dist: ${e}`);
      }
      if (!e.replace(/[#?].*$/, "").endsWith("/")) error(f, `enlace interno sin barra final: ${e}`);
    } else if (e.startsWith("https://docs.andarama.com")) {
      if (!existeDoc(e)) error(f, `enlace a documentación inexistente: ${e}`);
    } else if (!/^https?:\/\//.test(e)) {
      error(f, `enlace raro: ${e}`);
    }
  }
}
console.log(`\nTotal: ${totalPalabras} palabras en ${ficheros.length} artículos`);
if (errores > 0) {
  console.log(`\n${errores} problema(s).`);
  process.exit(1);
}
console.log("\nTodo en orden.");
