/**
 * RSS del blog, uno por idioma: `/blog/rss.xml`, `/en/blog/rss.xml`…
 * La ruta se calcula con el slug traducido del blog de cada idioma.
 */
import rss from "@astrojs/rss";
import type { APIRoute, GetStaticPaths } from "astro";
import { publishedPosts } from "../../data/rutas";
import { absolute, blogPostPath, LANGS, pagePath, rssPath, t, type Lang } from "../../i18n";

export const getStaticPaths = (() => {
  return LANGS.map((lang) => ({
    params: { blog: rssPath(lang).replace(/^\//, "").replace(/\/rss\.xml$/, "") },
    props: { lang },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const lang = (props as { lang: Lang }).lang;
  const posts = (await publishedPosts()).filter((p) => p.data.lang === lang);
  return rss({
    title: t(lang, "blog.title"),
    description: t(lang, "blog.description"),
    site: absolute(pagePath(lang, "blog")),
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.fecha,
      link: absolute(blogPostPath(lang, p.data.slug)),
      categories: [p.data.cluster],
      author: "jl@joseluissaorin.com (José Luis Saorín)",
    })),
    customData: `<language>${lang}</language>`,
  });
};
