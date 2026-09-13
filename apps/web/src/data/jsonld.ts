/**
 * Los objetos JSON-LD (schema.org) que cada página mete en su <head>.
 * Devuelven objetos planos; `Base.astro` los serializa tal cual en un
 * `<script type="application/ld+json">`.
 */
import { PLANS, type PlanSlug } from "../../../api/src/lib/plans";
import { absolute, SITE, t, type Lang } from "../i18n";
import { AULA_EUR_YEAR, planHref } from "./planes";

const CONTEXT = "https://schema.org";

/** Identificador estable de la organización; otras entidades lo enlazan. */
export const ORGANIZATION_ID = `${SITE}/#organizacion`;
export const SOFTWARE_ID = `${SITE}/#software`;
export const GITHUB_URL = "https://github.com/joseluissaorin/andarama";
export const LICENSE_URL = "https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12";

const AUTOR = {
  "@type": "Person",
  name: "José Luis Saorín",
  url: "https://joseluissaorin.com",
  sameAs: ["https://github.com/joseluissaorin"],
};

export interface MigaJsonLd {
  name: string;
  path: string;
}

export interface PreguntaJsonLd {
  q: string;
  a: string;
}

export interface ArticuloJsonLd {
  lang: Lang;
  title: string;
  description: string;
  /** Ruta de la entrada, absoluta desde la raíz. */
  path: string;
  published: Date;
  updated?: Date;
  author: { name: string; path: string; url?: string };
  /** Ruta o URL de la imagen destacada. */
  image?: string;
}

/** Quita el HTML ligero de las respuestas y textos que llevan enlaces. */
function sinHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function urlDe(pathOrUrl: string): string {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : absolute(pathOrUrl);
}

export function organizationJsonLd(): object {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: "Andarama",
    url: `${SITE}/`,
    logo: { "@type": "ImageObject", url: absolute("/logo-andarama.svg") },
    sameAs: [GITHUB_URL],
    founder: AUTOR,
  };
}

/** Una oferta por plan alojado, más la gratuita (instalártelo). */
function ofertas(lang: Lang): object[] {
  const casa = {
    "@type": "Offer",
    name: t(lang, "precios.planes.casa.nombre"),
    price: 0,
    priceCurrency: "EUR",
    url: "https://docs.andarama.com/despliegue/escritorio/",
    availability: "https://schema.org/InStock",
  };
  const alojados = (Object.keys(PLANS) as PlanSlug[]).map((slug) => {
    const plan = PLANS[slug];
    const esAula = slug === "aula";
    return {
      "@type": "Offer",
      name: plan.name,
      price: esAula ? AULA_EUR_YEAR : plan.amountCents / 100,
      priceCurrency: esAula ? "EUR" : "USD",
      url: planHref(slug),
      availability: "https://schema.org/InStock",
      description: `${t(lang, "precios.recorridos." + (plan.quotaTours === 1 ? "uno" : "varios"), { n: plan.quotaTours })} · ${t(lang, `precios.periodo.${plan.period}`)}`,
    };
  });
  return [casa, ...alojados];
}

export function softwareJsonLd(lang: Lang): object {
  return {
    "@context": CONTEXT,
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_ID,
    name: t(lang, "jsonld.app_nombre"),
    description: t(lang, "jsonld.app_descripcion"),
    applicationCategory: t(lang, "jsonld.categoria"),
    operatingSystem: "Web, macOS, Windows, Linux",
    url: `${SITE}/`,
    inLanguage: lang,
    license: LICENSE_URL,
    isAccessibleForFree: true,
    codeRepository: GITHUB_URL,
    author: AUTOR,
    publisher: { "@id": ORGANIZATION_ID },
    offers: ofertas(lang),
  };
}

export function faqJsonLd(lista: PreguntaJsonLd[]): object {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: lista.map((f) => ({
      "@type": "Question",
      name: sinHtml(f.q),
      acceptedAnswer: { "@type": "Answer", text: sinHtml(f.a) },
    })),
  };
}

export function breadcrumbJsonLd(items: MigaJsonLd[]): object {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absolute(it.path),
    })),
  };
}

export function articleJsonLd(a: ArticuloJsonLd): object {
  const url = absolute(a.path);
  return {
    "@context": CONTEXT,
    "@type": "BlogPosting",
    "@id": url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    headline: a.title,
    description: a.description,
    inLanguage: a.lang,
    datePublished: a.published.toISOString(),
    dateModified: (a.updated ?? a.published).toISOString(),
    ...(a.image != null ? { image: urlDe(a.image) } : {}),
    author: {
      "@type": "Person",
      name: a.author.name,
      url: absolute(a.author.path),
      ...(a.author.url != null ? { sameAs: [a.author.url] } : {}),
    },
    publisher: { "@id": ORGANIZATION_ID },
  };
}

export function personJsonLd(p: { name: string; path: string; url?: string; github?: string; rol?: string; bio?: string }): object {
  return {
    "@context": CONTEXT,
    "@type": "Person",
    name: p.name,
    url: p.url ?? absolute(p.path),
    ...(p.rol != null ? { jobTitle: p.rol } : {}),
    ...(p.bio != null ? { description: p.bio } : {}),
    sameAs: [p.url, p.github].filter((x): x is string => x != null),
    worksFor: { "@id": ORGANIZATION_ID },
  };
}

/** Una herramienta gratuita del navegador (visor, pequeño planeta, cubemap). */
export function webApplicationJsonLd(lang: Lang, name: string, description: string, path: string): object {
  return {
    "@context": CONTEXT,
    "@type": "WebApplication",
    name,
    description,
    url: absolute(path),
    inLanguage: lang,
    applicationCategory: t(lang, "jsonld.categoria"),
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript and WebGL",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: 0, priceCurrency: "EUR" },
    provider: { "@id": ORGANIZATION_ID },
    isPartOf: { "@id": SOFTWARE_ID },
  };
}
