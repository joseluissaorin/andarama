---
title: Andarama
description: Recorridos virtuales 360 de código abierto — ¡anda! andarama me deja andar por panoramas
---

Andarama es una plataforma web de código abierto para crear, publicar y distribuir tours virtuales 360 interactivos. Se compone de tres piezas:

1. **Andarama Studio**: editor visual en el navegador para construir tours sin conocimientos técnicos.
2. **Andarama Viewer**: motor de visualización WebGL embebible y exportable como paquete HTML estático autocontenido.
3. **Andarama API**: backend ligero (proyectos, usuarios, medios, procesado, analítica, colaboración en tiempo real).

## Dos formas de desplegar

- **Cloudflare (referencia)**: toda la plataforma corre sobre Workers, D1, R2, KV, Durable Objects y Workers Analytics Engine, dentro del free tier para usos pequeños y medios. `pnpm deploy:cloudflare` y en menos de 10 minutos tienes una instancia.
- **Self-host**: una única imagen Docker (Node.js + SQLite + sistema de ficheros). `docker compose up -d` es suficiente.

## Capacidades principales

- Panoramas multirresolución (tiles) hasta 32K, panoramas parciales, cubemaps y gigapixel 2D.
- Vídeo 360 (MP4/WebM/HLS, mono y estéreo) con hotspots sincronizados por línea de tiempo.
- Audio ambiente, narración (con bloqueo de navegación), audio espacial HRTF y música global con ducking.
- 17 tipos de hotspot: navegación, texto Markdown, imagen con zoom profundo, galería, vídeo, YouTube/Vimeo/PeerTube, audio, PDF, modelo 3D (con AR), web, formulario con Turnstile, comparador (imágenes o panoramas), quiz, polígono, etiqueta, enlace y contador/estado.
- Planos de planta con radar de orientación multi-planta y mapa geográfico OSM/Leaflet.
- Modo VR con gafas (WebXR con manos de 25 articulaciones y mandos) y modo cartón con selección por mirada; giroscopio con retículo, deep links y proyecciones little planet/fisheye/panini/arquitectónica.
- Editor con paleta buscable de hotspots, panel por pestañas, grafo donde cada arista **es** un hotspot de navegación y modo de recorridos guiados.
- Biblioteca de medios con previsualización 360 al vuelo: el ratón encima enseña un little planet y el doble clic abre el panorama completo.
- Valores por defecto en cascada (instancia, organización, usuario, plantilla) y control de la tarjeta que se ve al compartir el enlace.
- Multiidioma de contenido con export/import XLIFF y CSV.
- Accesibilidad WCAG 2.1 AA con modo de contenido accesible lineal (también útil para SEO).
- Tours guiados en vivo (un guía controla la vista de N asistentes), comentarios, versiones, presencia.
- Quiz con puntuación y certificado, búsqueda del tesoro, **LTI 1.3** con devolución de calificaciones a Moodle y export **SCORM 1.2/2004**.
- Analítica propia sin cookies (RGPD): embudo de escenas, hotspots más usados y mapa de calor de orientaciones.
- Export ZIP autocontenido (también HTML único, kiosko y PWA offline).

## Licencia

Código bajo [EUPL-1.2](https://joinup.ec.europa.eu/collection/eupl). Nacido como ULL360 en la Universidad de La Laguna; hoy se llama Andarama. Medios de ejemplo bajo CC BY 4.0.
