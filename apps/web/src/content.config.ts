/**
 * Colecciones de contenido:
 *  - blog: artículos en Markdown (uno por idioma; `translationOf` agrupa las
 *    versiones de un mismo artículo para el hreflang).
 *  - competidores: fichas YAML de las que salen las tablas «Andarama vs X»
 *    y las listas «Alternativas a X».
 *  - autores: quién firma.
 */
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const siNoParcial = z.union([z.boolean(), z.literal("parcial")]).nullable();

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    lang: z.string(),
    slug: z.string(),
    /** Cluster del estudio de mercado: competidores, herramientas, docencia, conceptos, verticales… */
    cluster: z.string(),
    /** Slug del artículo original (en español) del que este es traducción. */
    translationOf: z.string().optional(),
    fecha: z.coerce.date(),
    actualizado: z.coerce.date().optional(),
    autor: z.string().default("jose-luis-saorin"),
    /** Plantilla programática que se inserta tras la entradilla. */
    plantilla: z.enum(["vs", "alternativas"]).optional(),
    /** Para «vs»: id del competidor. */
    competidor: z.string().optional(),
    /** Para «alternativas»: ids de los competidores, en orden. */
    competidores: z.array(z.string()).optional(),
    imagen: z.string().optional(),
    /** Preguntas frecuentes al final del artículo; salen también como FAQPage en JSON-LD. */
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
    borrador: z.boolean().default(false),
  }),
});

const competidores = defineCollection({
  loader: glob({ pattern: "*.yaml", base: "./src/content/competidores" }),
  schema: z.object({
    nombre: z.string(),
    web: z.string().url(),
    pais: z.string().nullable(),
    tipo: z.enum(["saas", "desktop", "library", "plugin", "opensource"]),
    gratis: z.boolean(),
    gratis_detalle: z.string().nullable(),
    planes: z.array(
      z.object({
        nombre: z.string(),
        precio: z.number(),
        moneda: z.enum(["USD", "EUR", "GBP"]),
        periodo: z.enum(["month", "year", "once"]),
        precio_mes_anual: z.number().nullable(),
        precio_anual: z.number().nullable(),
        verificado: z.boolean(),
      }),
    ),
    cuotas: z.string().nullable(),
    rv: siNoParcial,
    scorm: siNoParcial,
    lti: siNoParcial,
    exportacion: siNoParcial,
    exportacion_detalle: z.string().nullable(),
    codigo_abierto: z.boolean(),
    marca_blanca: siNoParcial,
    dominio_propio: siNoParcial,
    analitica_sin_cookies: siNoParcial,
    street_view: z.boolean(),
    verificado: z.boolean(),
    descripcion: z.record(z.string()),
    notas: z.string().nullable(),
  }),
});

const autores = defineCollection({
  loader: glob({ pattern: "*.yaml", base: "./src/content/autores" }),
  schema: z.object({
    nombre: z.string(),
    web: z.string().url().optional(),
    github: z.string().url().optional(),
    foto: z.string().optional(),
    /** Biografía por idioma (con caída al español). */
    bio: z.record(z.string()),
    /** Cargo o descripción corta por idioma. */
    rol: z.record(z.string()),
  }),
});

export const collections = { blog, competidores, autores };
