import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  base: "/docs",
  integrations: [
    starlight({
      title: "ULL360",
      description: "Plataforma de tours virtuales 360 de codigo abierto",
      defaultLocale: "root",
      locales: {
        root: { label: "Espanol", lang: "es" },
      },
      social: {
        github: "https://github.com/ull/ull360",
      },
      sidebar: [
        { label: "Introduccion", slug: "index" },
        {
          label: "Manual de usuario",
          items: [
            { label: "Primeros pasos", slug: "usuario/primeros-pasos" },
            { label: "Medios y tiles", slug: "usuario/medios" },
            { label: "Escenas y hotspots", slug: "usuario/escenas" },
            { label: "Publicar y exportar", slug: "usuario/publicar" },
            { label: "Docencia: quiz, LTI y SCORM", slug: "usuario/docencia" },
            { label: "Visitas guiadas en vivo", slug: "usuario/en-vivo" },
          ],
        },
        {
          label: "Administracion",
          items: [
            { label: "Guia de administracion", slug: "admin/guia" },
            { label: "Seguridad y RGPD", slug: "admin/seguridad" },
          ],
        },
        {
          label: "Despliegue",
          items: [
            { label: "Cloudflare (referencia)", slug: "despliegue/cloudflare" },
            { label: "Self-host (Docker)", slug: "despliegue/docker" },
          ],
        },
        {
          label: "Referencia",
          items: [
            { label: "API REST (OpenAPI)", slug: "referencia/api" },
            { label: "Formato tour.json", slug: "referencia/tour-json" },
            { label: "Arquitectura", slug: "referencia/arquitectura" },
          ],
        },
        { label: "Tutoriales", items: [{ label: "Tu primer tour", slug: "tutoriales/primer-tour" }] },
        { label: "Contribuir", slug: "contribuir" },
      ],
    }),
  ],
});
