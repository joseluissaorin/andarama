import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  base: "/docs",
  integrations: [
    starlight({
      title: "andarama",
      description: "¡anda! andarama me deja andar por panoramas: recorridos 360 de código abierto",
      defaultLocale: "root",
      locales: {
        root: { label: "Español", lang: "es" },
        en: { label: "English", lang: "en" },
      },
      customCss: ["./src/styles/andarama.css"],
      logo: {
        src: "./public/anda-criatura.svg",
        alt: "Andarama",
      },
      favicon: "/favicon.svg",
      // Tarjeta al pegar un enlace de la documentación en un chat
      head: [
        { tag: "meta", attrs: { property: "og:image", content: "https://andarama.com/landing/og.png" } },
        { tag: "meta", attrs: { property: "og:image:alt", content: "¡anda!, el lema de Andarama, con las criaturas amarillas andando" } },
        { tag: "meta", attrs: { property: "og:site_name", content: "andarama" } },
        { tag: "meta", attrs: { property: "og:locale", content: "es_ES" } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        { tag: "meta", attrs: { name: "theme-color", content: "#ff8a00" } },
      ],
      social: {
        github: "https://github.com/joseluissaorin/andarama",
      },
      sidebar: [
        { label: "Introducción", translations: { en: "Introduction" }, slug: "index" },
        {
          label: "Manual de usuario",
          translations: { en: "User guide" },
          items: [
            { label: "Primeros pasos", translations: { en: "Getting started" }, slug: "usuario/primeros-pasos" },
            { label: "Importar de una cámara 360", translations: { en: "Import from a 360 camera" }, slug: "usuario/importador" },
            { label: "Medios y tiles", translations: { en: "Media and tiles" }, slug: "usuario/medios" },
            { label: "Escenas y hotspots", translations: { en: "Scenes and hotspots" }, slug: "usuario/escenas" },
            { label: "El lienzo del tour", translations: { en: "The tour canvas" }, slug: "usuario/grafo" },
            { label: "Plano del recorrido", translations: { en: "Tour floor plan" }, slug: "usuario/plano" },
            { label: "Variables, acción y polígono", translations: { en: "Variables, actions and polygons" }, slug: "usuario/variables" },
            { label: "Música y audio", translations: { en: "Music and audio" }, slug: "usuario/audio" },
            { label: "Logotipo, marca de agua y parche de nadir", translations: { en: "Logo, watermark and nadir patch" }, slug: "usuario/marca" },
            { label: "Publicar y compartir", translations: { en: "Publish and share" }, slug: "usuario/publicar" },
            { label: "Exportar: ZIP, HTML único, PWA y SCORM", translations: { en: "Export: ZIP, single HTML, PWA and SCORM" }, slug: "usuario/exportar" },
            { label: "Embeber un tour", translations: { en: "Embed a tour" }, slug: "usuario/embeber" },
            { label: "Insertar en Moodle", translations: { en: "Add to Moodle" }, slug: "usuario/moodle" },
            { label: "La insignia «Hecho con Andarama»", translations: { en: "The Made with Andarama badge" }, slug: "usuario/insignia" },
            { label: "Realidad virtual (WebXR)", translations: { en: "Virtual reality (WebXR)" }, slug: "usuario/realidad-virtual" },
            { label: "Comprobar la realidad virtual", translations: { en: "Testing virtual reality" }, slug: "usuario/comprobar-realidad-virtual" },
            { label: "Docencia: quiz, SCORM y LTI", translations: { en: "Teaching: quiz, SCORM and LTI" }, slug: "usuario/docencia" },
            { label: "Cómo hacer un escape room", translations: { en: "How to make an escape room" }, slug: "usuario/escape-room" },
            { label: "Preguntas frecuentes del profesorado", translations: { en: "Teachers' FAQ" }, slug: "usuario/preguntas-profesorado" },
            { label: "Visita guiada con Meet o Teams", translations: { en: "Live guided tour with Meet or Teams" }, slug: "usuario/en-vivo" },
            { label: "Trabajar en equipo y compartir", translations: { en: "Teamwork and sharing" }, slug: "usuario/equipo" },
            { label: "Comentarios del equipo", translations: { en: "Team comments" }, slug: "usuario/comentarios" },
          ],
        },
        {
          label: "Administración",
          translations: { en: "Administration" },
          items: [
            { label: "Guía de administración", translations: { en: "Administration guide" }, slug: "admin/guia" },
            { label: "Seguridad y RGPD", translations: { en: "Security and GDPR" }, slug: "admin/seguridad" },
            { label: "Planes, Clerk y uso razonable", translations: { en: "Plans, Clerk and fair use" }, slug: "admin/planes" },
          ],
        },
        {
          label: "Despliegue",
          translations: { en: "Deployment" },
          items: [
            { label: "Cloudflare (referencia)", translations: { en: "Cloudflare (reference)" }, slug: "despliegue/cloudflare" },
            { label: "Instalación en un servidor propio", translations: { en: "Install on your own server" }, slug: "despliegue/servidor-propio" },
            { label: "Self-host (Docker)", translations: { en: "Self-host (Docker)" }, slug: "despliegue/docker" },
            { label: "Ejecutable de escritorio", translations: { en: "Desktop app" }, slug: "despliegue/escritorio" },
            { label: "Dominio propio para un tour", translations: { en: "Custom domain for a tour" }, slug: "despliegue/dominios" },
          ],
        },
        {
          label: "Referencia",
          translations: { en: "Reference" },
          items: [
            { label: "API REST (OpenAPI)", translations: { en: "REST API (OpenAPI)" }, slug: "referencia/api" },
            { label: "Formato tour.json", translations: { en: "tour.json format" }, slug: "referencia/tour-json" },
            { label: "Referencia de widgets", translations: { en: "Widget reference" }, slug: "referencia/widgets" },
            { label: "Arquitectura", translations: { en: "Architecture" }, slug: "referencia/arquitectura" },
          ],
        },
        {
          label: "Tutoriales",
          translations: { en: "Tutorials" },
          items: [{ label: "Tu primer tour", translations: { en: "Your first tour" }, slug: "tutoriales/primer-tour" }],
        },
        { label: "Contribuir", translations: { en: "Contributing" }, slug: "contribuir" },
        {
          label: "Código en GitHub",
          translations: { en: "Code on GitHub" },
          link: "https://github.com/joseluissaorin/andarama",
          attrs: { target: "_blank", rel: "noreferrer" },
        },
      ],
    }),
  ],
});
