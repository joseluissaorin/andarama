---
title: Arquitectura
---

## Principios de diseno

1. **Cloudflare-nativo, no Cloudflare-cautivo.** Toda dependencia de plataforma pasa por interfaces de adaptador (`StorageAdapter`, `KVAdapter`, `QueueAdapter`, `AnalyticsAdapter`, `PasswordHasher`, `EmailAdapter`). Ningun modulo de dominio importa APIs de Cloudflare directamente.
2. **El computo pesado vive en el cliente.** El troceado de imagenes (GPU en WebWorker) y la generacion de ZIPs se ejecutan en el navegador; el servidor coordina, valida y persiste. Esto hace viable el despliegue 100% Workers dentro del free tier.
3. **Publicacion = artefacto estatico.** Publicar materializa un `tour.json` inmutable + mapa de assets en el almacenamiento. Servir un tour es servir ficheros: la ruta `/t/{slug}` **no consulta la base de datos**.
4. **El visor es una libreria.** El mismo paquete `@ull360/viewer` alimenta la vista previa del Studio, los tours publicados y los ZIP exportados. Cero divergencia.
5. **Un esquema, una fuente de verdad.** `tour.json` (JSON Schema versionado en `@ull360/schema`) es el contrato entre todas las piezas.

## Monorepo

```
apps/      studio (React SPA) - api (Hono, Workers+Node) - realtime (DO + ws) - docs
packages/  schema - viewer - viewer-ui - tiler - exporter - adapters - db - ui
deploy/    cloudflare (wrangler + bootstrap) - docker (imagen unica)
```

Elecciones clave: **Hono** corre identico en Workers y Node; **Drizzle** comparte el dialecto SQLite entre D1 y better-sqlite3; el render multirresolucion usa **Marzipano** (Apache-2.0) como base probada con capas propias para video 360, WebXR, poligonos, audio espacial y proyecciones adicionales (decision de fase 0: el fork compensaba frente a reimplementar el sistema de tiles).

## Pipeline de medios

1. El Studio pide la subida a la API: validacion de tipo y cuota, URLs multiparte prefirmadas.
2. El navegador sube el original (reanudable) y confirma; la API verifica tamano y **magic bytes**.
3. El **tiler del navegador** (WebWorker + WebGL) genera caras de cubo, piramide, tiles WebP, preview y miniatura, y los sube por lotes; la API valida el manifiesto (recuento y muestreo).
4. Imagenes que exceden el cliente o subidas por API encolan un trabajo para el runner Node (`ull360-tile`).
5. Video: Cloudflare Stream opcional; sin el, MP4/WebM validados con recomendaciones de ffmpeg (transcodificacion local opcional en self-host).

## Presupuestos de rendimiento

- Runtime del visor: **99 KB gzip** (presupuesto: menos de 250 KB); VR, PDF.js, hls.js, model-viewer y Leaflet se cargan bajo demanda como chunks separados.
- Primera vista util con preview borroso embebido en el `tour.json` (base64) + nivel base + tiles del frustum.
- Monitor de FPS interno con degradacion automatica (desactiva efectos si baja de 40 FPS).
