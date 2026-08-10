# ULL360

Plataforma web de código abierto para crear, publicar y distribuir tours virtuales 360 interactivos, desarrollada para la Universidad de La Laguna y utilizable por cualquier organización.

ULL360 se compone de tres piezas:

1. **ULL360 Studio** - editor visual en el navegador (SPA) para construir tours sin conocimientos técnicos.
2. **ULL360 Viewer** - motor de visualización WebGL embebible y exportable como paquete HTML estático autocontenido.
3. **ULL360 API** - backend ligero (gestión de proyectos, usuarios, medios, procesado, analítica, colaboración en tiempo real).

**Demo de referencia**: https://ull360.jlsf2005.workers.dev

- Tour con fotografías esféricas reales: [/t/recorrido-real](https://ull360.jlsf2005.workers.dev/t/recorrido-real) (imágenes de Wikimedia Commons bajo CC BY-SA; atribuciones dentro del propio tour).
- Tour sintético de demostración: [/t/campus-de-guajara](https://ull360.jlsf2005.workers.dev/t/campus-de-guajara).
- Documentación: [/docs](https://ull360.jlsf2005.workers.dev/docs/).

La trazabilidad completa de la especificación a la implementación está en [REQUIREMENTS.md](REQUIREMENTS.md).

## Realidad virtual

Todos los tours se ven con gafas (Meta Quest, Pico, Vive, Vision Pro y cualquier equipo con WebXR) sin instalar nada: se abre la dirección del tour en el navegador de las gafas y se pulsa **Modo VR**. Las manos aparecen dentro del tour con sus 25 articulaciones y accionan los hotspots con la pinza de pulgar e índice; con mandos se apunta con el rayo y se acciona con el gatillo. Los 17 tipos de hotspot son accesibles en la sesión inmersiva —los que no se pueden componer dentro de las gafas (PDF, formularios, web incrustada, modelos 3D) se abren automáticamente al salir—. Sin WebXR el mismo botón entra en modo cardboard (pantalla partida, giroscopio y selección por mirada).

WebXR exige un contexto seguro: el tour debe servirse por `https://` (o `localhost`). Los paquetes exportados incluyen la realidad virtual, pero solo entran en modo inmersivo si se suben a un alojamiento con HTTPS. Detalles en la [guía de realidad virtual](apps/docs/src/content/docs/usuario/realidad-virtual.md).

## Objetivos de despliegue

- **Cloudflare "un comando"**: toda la plataforma (frontend, API, base de datos, almacenamiento, colas, tiempo real, analítica) corre sobre Workers, D1, R2, KV, Durable Objects, Queues y Workers Analytics Engine, dentro del free tier para usos pequeños y medios.

  ```bash
  git clone https://github.com/joseluissaorin/ull360 && cd ull360
  pnpm install
  pnpm deploy:cloudflare
  ```

- **Self-hosting trivial**: una única imagen Docker (Node.js + SQLite + sistema de ficheros) que replica el comportamiento de Cloudflare mediante una capa de adaptadores.

  ```bash
  curl -O https://raw.githubusercontent.com/joseluissaorin/ull360/main/deploy/docker/docker-compose.yml
  docker compose up -d
  ```

## Estructura del monorepo

```
ull360/
├─ apps/
│  ├─ studio/            # Editor SPA (React 18 + Vite + TanStack Query/Router + Zustand)
│  ├─ api/               # Worker Hono: API + auth + servido de tours + assets
│  ├─ realtime/          # Durable Objects (LiveTourRoom, ProjectPresence)
│  └─ docs/              # Documentación (Astro Starlight)
├─ packages/
│  ├─ schema/            # tour.json: tipos TS + JSON Schema + migradores de versión
│  ├─ viewer/            # Motor 360 (TS + WebGL, base Marzipano con capas propias)
│  ├─ viewer-ui/         # Skin del visor (Web Components, framework-agnostic)
│  ├─ tiler/             # Tiling en navegador (WebWorkers) y en Node (sharp)
│  ├─ exporter/          # Generador de paquetes estáticos/SCORM (browser + Node)
│  ├─ adapters/          # Interfaces + impl. cloudflare/ y node/
│  ├─ db/                # Esquema Drizzle ORM + migraciones (D1 y SQLite)
│  └─ ui/                # Design system del Studio (Radix + Tailwind, tema ULL)
├─ deploy/
│  ├─ cloudflare/        # wrangler.jsonc, script bootstrap
│  └─ docker/            # Dockerfile único, docker-compose.yml, Caddyfile
└─ tooling/              # eslint, tsconfig, playwright
```

## Desarrollo

```bash
pnpm install
pnpm build:packages      # compila packages/
pnpm dev                 # API worker en local (wrangler dev, puerto 8787)
pnpm dev:studio          # Studio con Vite (puerto 5173, proxy a la API)
pnpm dev:node            # variante self-host (Node + SQLite) en el puerto 8788
pnpm test                # tests unitarios (Vitest)
pnpm test:e2e            # tests E2E (Playwright)
```

El script `scripts/seed-demo.mjs` construye y publica el tour de demostración con fotografías reales contra cualquier instancia: `node scripts/seed-demo.mjs <url-base> <email> <password> <dir-panoramas>` (el directorio debe contener panoramas equirectangulares y un `atribuciones.json`).

## Documentación

La documentación completa (manual de usuario, guía de administración, guías de despliegue, referencia OpenAPI, formato tour.json y tutoriales) vive en `apps/docs` y se publica junto con la instancia en `/docs`.

## Licencia

[EUPL-1.2](LICENSE). Titularidad del código: Universidad de La Laguna. Los medios de ejemplo se publican bajo CC BY 4.0; las fotografías del tour de demostración proceden de Wikimedia Commons (CC BY-SA, atribuciones en el propio tour). Véase [AUTHORS](AUTHORS).

Los materiales de terceros incluidos (marca y tipografía oficiales de la ULL, dependencias destacadas) se detallan en [NOTICE.md](NOTICE.md); la marca de la Universidad de La Laguna no queda cubierta por la EUPL. Código de conducta en [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Seguridad

Divulgación responsable de vulnerabilidades: véase [SECURITY.md](SECURITY.md).
