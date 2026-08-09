---
title: ULL360
description: Plataforma de tours virtuales 360 de codigo abierto de la Universidad de La Laguna
---

ULL360 es una plataforma web de codigo abierto para crear, publicar y distribuir tours virtuales 360 interactivos. Se compone de tres piezas:

1. **ULL360 Studio**: editor visual en el navegador para construir tours sin conocimientos tecnicos.
2. **ULL360 Viewer**: motor de visualizacion WebGL embebible y exportable como paquete HTML estatico autocontenido.
3. **ULL360 API**: backend ligero (proyectos, usuarios, medios, procesado, analitica, colaboracion en tiempo real).

## Dos formas de desplegar

- **Cloudflare (referencia)**: toda la plataforma corre sobre Workers, D1, R2, KV, Durable Objects y Workers Analytics Engine, dentro del free tier para usos pequenos y medios. `pnpm deploy:cloudflare` y en menos de 10 minutos tienes una instancia.
- **Self-host**: una unica imagen Docker (Node.js + SQLite + sistema de ficheros). `docker compose up -d` es suficiente.

## Capacidades principales

- Panoramas multirresolucion (tiles) hasta 32K, panoramas parciales, cubemaps y gigapixel 2D.
- Video 360 (MP4/WebM/HLS, mono y estereo) con hotspots sincronizados por linea de tiempo.
- Audio ambiente, narracion (con bloqueo de navegacion), audio espacial HRTF y musica global con ducking.
- 17 tipos de hotspot: navegacion, texto Markdown, imagen con zoom profundo, galeria, video, YouTube/Vimeo/PeerTube, audio, PDF, modelo 3D (con AR), web, formulario con Turnstile, comparador (imagenes o panoramas), quiz, poligono, etiqueta, enlace y contador/estado.
- Planos de planta con radar de orientacion multi-planta y mapa geografico OSM/Leaflet.
- Modo VR (WebXR + cardboard), giroscopio, deep links, proyecciones little planet/fisheye/panini/arquitectonica.
- Multiidioma de contenido con export/import XLIFF y CSV.
- Accesibilidad WCAG 2.1 AA con modo de contenido accesible lineal (tambien util para SEO).
- Tours guiados en vivo (un guia controla la vista de N asistentes), comentarios, versiones, presencia.
- Quiz con puntuacion y certificado, busqueda del tesoro, **LTI 1.3** con devolucion de calificaciones a Moodle y export **SCORM 1.2/2004**.
- Analitica propia sin cookies (RGPD): embudo de escenas, hotspots mas usados y mapa de calor de orientaciones.
- Export ZIP autocontenido (tambien HTML unico, kiosko y PWA offline).

## Licencia

Codigo bajo [EUPL-1.2](https://joinup.ec.europa.eu/collection/eupl). Titularidad: Universidad de La Laguna. Medios de ejemplo bajo CC BY 4.0.
