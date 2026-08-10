---
title: Arquitectura
---

## Principios de diseño

1. **Cloudflare-nativo, no Cloudflare-cautivo.** Toda dependencia de plataforma pasa por interfaces de adaptador (`StorageAdapter`, `KVAdapter`, `QueueAdapter`, `AnalyticsAdapter`, `PasswordHasher`, `EmailAdapter`). Ningún módulo de dominio importa APIs de Cloudflare directamente.
2. **El cómputo pesado vive en el cliente.** El troceado de imágenes (GPU en WebWorker) y la generación de ZIPs se ejecutan en el navegador; el servidor coordina, valida y persiste. Esto hace viable el despliegue 100% Workers dentro del free tier.
3. **Publicación = artefacto estático.** Publicar materializa un `tour.json` inmutable + mapa de assets en el almacenamiento. Servir un tour es servir ficheros: la ruta `/t/{slug}` **no consulta la base de datos**.
4. **El visor es una librería.** El mismo paquete `@ull360/viewer` alimenta la vista previa del Studio, los tours publicados y los ZIP exportados. Cero divergencia.
5. **Un esquema, una fuente de verdad.** `tour.json` (JSON Schema versionado en `@ull360/schema`) es el contrato entre todas las piezas.
6. **Una cosa, un dato.** Nada de estructuras paralelas que digan lo mismo: una arista del grafo *es* un hotspot de navegación; el área *es* a la vez la planta del plano, la zona del lienzo y la categoría del menú de escenas; y los valores por defecto se resuelven en cascada en vez de copiarse. Un dato que nadie lee acaba mintiendo.

## Monorepo

```
apps/      studio (React SPA) - api (Hono, Workers+Node) - realtime (DO + ws) - docs
packages/  schema - viewer - viewer-ui - tiler - exporter - adapters - db - ui
deploy/    cloudflare (wrangler + bootstrap) - docker (imagen unica)
```

Elecciones clave: **Hono** corre idéntico en Workers y Node; **Drizzle** comparte el dialecto SQLite entre D1 y better-sqlite3; el render multirresolución usa **Marzipano** (Apache-2.0) como base probada con capas propias para vídeo 360, WebXR, polígonos, audio espacial y proyecciones adicionales (decisión de fase 0: el fork compensaba frente a reimplementar el sistema de tiles).

## Pipeline de medios

1. El Studio pide la subida a la API: validación de tipo y cuota, URLs multiparte prefirmadas.
2. El navegador sube el original (reanudable) y confirma; la API verifica tamaño y **magic bytes**.
3. El **tiler del navegador** (WebWorker + WebGL) genera caras de cubo, pirámide, tiles WebP, preview y miniatura, y los sube por lotes; la API valida el manifiesto (recuento y muestreo).
4. Imágenes que exceden el cliente o subidas por API encolan un trabajo para el runner Node (`ull360-tile`).
5. Vídeo: Cloudflare Stream opcional; sin él, MP4/WebM validados con recomendaciones de ffmpeg (transcodificación local opcional en self-host).

## Presupuestos de rendimiento

- Runtime del visor: **117 KB gzip** con el motor WebXR incluido (presupuesto: menos de 250 KB); PDF.js, hls.js, model-viewer y Leaflet se cargan bajo demanda como chunks separados.
- Motor WebXR (`engine/xr/`): renderer WebGL propio de un solo programa, sin dependencias ni DOM, para que la realidad virtual sobreviva intacta en los paquetes exportados. Dentro de la sesión el panorama se resuelve como esfera equirectangular de una textura (2048 px en tours multirresolución) en lugar de mosaico de tiles: en estéreo, una textura estable rinde mejor que la carga progresiva.
- Primera vista útil con preview borroso embebido en el `tour.json` (base64) + nivel base + tiles del frustum.
- Monitor de FPS interno con degradación automática (desactiva efectos si baja de 40 FPS).

## Piezas destacadas del visor

| Módulo | Qué resuelve |
|---|---|
| `engine/xr/render.ts` | Renderer WebGL propio de un solo programa: esfera del entorno, billboards, rayos y paneles |
| `engine/xr/orientation.ts` | Orientación del móvil por cuaterniones con compensación del giro de pantalla (modo cartón) |
| `engine/xr/input.ts` | Manos con las 25 articulaciones, mandos y pinza con histéresis |
| `engine/xr/panel.ts` | Paneles inmersivos dibujados con Canvas 2D y subidos como textura |
| `viewer-ui/gaze.ts` | Retículo de mirada del visor plano: permanencia, margen de cabeza y cursor arrastrado por la cabeza |
| `viewer-ui/url.ts` | Resolución de rutas del arranque autónomo (sin DOM, para poder probarla) |

## Cascada de valores por defecto

`instancia → organización → usuario → plantilla → tour`. La resuelve
`apps/api/src/lib/defaults.ts` al crear un proyecto, y los cambios de la
organización se propagan a los borradores que no habían personalizado la clave.
Los tours publicados son instantáneas: no cambian hasta republicarse.
