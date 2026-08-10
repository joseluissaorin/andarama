import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  base: "/docs",
  integrations: [
    starlight({
      title: "ULL360",
      description: "Plataforma de tours virtuales 360 de código abierto",
      defaultLocale: "root",
      locales: {
        root: { label: "Español", lang: "es" },
      },
      social: {
        github: "https://github.com/ull/ull360",
      },
      sidebar: [
        { label: "Introducción", slug: "index" },
        {
          label: "Manual de usuario",
          items: [
            { label: "Primeros pasos", slug: "usuario/primeros-pasos" },
            { label: "Importar de una cámara 360", slug: "usuario/importador" },
            { label: "Medios y tiles", slug: "usuario/medios" },
            { label: "Escenas y hotspots", slug: "usuario/escenas" },
            { label: "El grafo de escenas", slug: "usuario/grafo" },
            { label: "Publicar y exportar", slug: "usuario/publicar" },
            { label: "Embeber un tour", slug: "usuario/embeber" },
            { label: "Docencia: quiz, LTI y SCORM", slug: "usuario/docencia" },
            { label: "Visitas guiadas en vivo", slug: "usuario/en-vivo" },
          ],
        },
        {
          label: "Administración",
          items: [
            { label: "Guía de administración", slug: "admin/guia" },
            { label: "Seguridad y RGPD", slug: "admin/seguridad" },
          ],
        },
        {
          label: "Despliegue",
          items: [
            { label: "Cloudflare (referencia)", slug: "despliegue/cloudflare" },
            { label: "Self-host (Docker)", slug: "despliegue/docker" },
            { label: "Dominio propio para un tour", slug: "despliegue/dominios" },
          ],
        },
        {
          label: "Referencia",
          items: [
            { label: "API REST (OpenAPI)", slug: "referencia/api" },
            { label: "Formato tour.json", slug: "referencia/tour-json" },
            { label: "Referencia de widgets", slug: "referencia/widgets" },
            { label: "Arquitectura", slug: "referencia/arquitectura" },
          ],
        },
        { label: "Tutoriales", items: [{ label: "Tu primer tour", slug: "tutoriales/primer-tour" }] },
        { label: "Contribuir", slug: "contribuir" },
      ],
    }),
  ],
});
