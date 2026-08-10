---
title: ULL360
description: Plataforma de tours virtuales 360 de código abierto de la Universidad de La Laguna
---

ULL360 es una plataforma web de código abierto para crear, publicar y distribuir tours virtuales 360 interactivos. Se compone de tres piezas:

1. **ULL360 Studio**: editor visual en el navegador para construir tours sin conocimientos técnicos.
2. **ULL360 Viewer**: motor de visualización WebGL embebible y exportable como paquete HTML estático autocontenido.
3. **ULL360 API**: backend ligero (proyectos, usuarios, medios, procesado, analítica, colaboración en tiempo real).

## Dos formas de desplegar

- **Cloudflare (referencia)**: toda la plataforma corre sobre Workers, D1, R2, KV, Durable Objects y Workers Analytics Engine, dentro del free tier para usos pequeños y medios. `pnpm deploy:cloudflare` y en menos de 10 minutos tienes una instancia.
- **Self-host**: una única imagen Docker (Node.js + SQLite + sistema de ficheros). `docker compose up -d` es suficiente.

## Capacidades principales

- Panoramas multirresolución (tiles) hasta 32K, panoramas parciales, cubemaps y gigapixel 2D.
- Video 360 (MP4/WebM/HLS, mono y estéreo) con hotspots sincronizados por línea de tiempo.
- Audio ambiente, narración (con bloqueo de navegación), audio espacial HRTF y música global con ducking.
- 17 tipos de hotspot: navegación, texto Markdown, imagen con zoom profundo, galería, video, YouTube/Vimeo/PeerTube, audio, PDF, modelo 3D (con AR), web, formulario con Turnstile, comparador (imágenes o panoramas), quiz, polígono, etiqueta, enlace y contador/estado.
- Planos de planta con radar de orientación multi-planta y mapa geográfico OSM/Leaflet.
- Modo VR (WebXR + cardboard), giroscopio, deep links, proyecciones little planet/fisheye/panini/arquitectónica.
- Multiidioma de contenido con export/import XLIFF y CSV.
- Accesibilidad WCAG 2.1 AA con modo de contenido accesible lineal (también útil para SEO).
- Tours guiados en vivo (un guía controla la vista de N asistentes), comentarios, versiones, presencia.
- Quiz con puntuación y certificado, búsqueda del tesoro, **LTI 1.3** con devolución de calificaciones a Moodle y export **SCORM 1.2/2004**.
- Analítica propia sin cookies (RGPD): embudo de escenas, hotspots más usados y mapa de calor de orientaciones.
- Export ZIP autocontenido (también HTML único, kiosko y PWA offline).

## Licencia

Código bajo [EUPL-1.2](https://joinup.ec.europa.eu/collection/eupl). Titularidad: Universidad de La Laguna. Medios de ejemplo bajo CC BY 4.0.
