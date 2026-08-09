# ULL360

Plataforma web de codigo abierto para crear, publicar y distribuir tours virtuales 360 interactivos, desarrollada para la Universidad de La Laguna y utilizable por cualquier organizacion.

ULL360 se compone de tres piezas:

1. **ULL360 Studio** - editor visual en el navegador (SPA) para construir tours sin conocimientos tecnicos.
2. **ULL360 Viewer** - motor de visualizacion WebGL embebible y exportable como paquete HTML estatico autocontenido.
3. **ULL360 API** - backend ligero (gestion de proyectos, usuarios, medios, procesado, analitica, colaboracion en tiempo real).

## Objetivos de despliegue

- **Cloudflare "un comando"**: toda la plataforma (frontend, API, base de datos, almacenamiento, colas, tiempo real, analitica) corre sobre Workers, D1, R2, KV, Durable Objects, Queues y Workers Analytics Engine, dentro del free tier para usos pequenos y medios.

  ```bash
  git clone https://github.com/ull/ull360 && cd ull360
  pnpm install
  pnpm deploy:cloudflare
  ```

- **Self-hosting trivial**: una unica imagen Docker (Node.js + SQLite + sistema de ficheros) que replica el comportamiento de Cloudflare mediante una capa de adaptadores.

  ```bash
  curl -O https://raw.githubusercontent.com/ull/ull360/main/deploy/docker/docker-compose.yml
  docker compose up -d
  ```

## Estructura del monorepo

```
ull360/
├─ apps/
│  ├─ studio/            # Editor SPA (React 18 + Vite + TanStack Query/Router + Zustand)
│  ├─ api/               # Worker Hono: API + auth + servido de tours + assets
│  ├─ realtime/          # Durable Objects (LiveTourRoom, ProjectPresence)
│  └─ docs/              # Documentacion (Astro Starlight)
├─ packages/
│  ├─ schema/            # tour.json: tipos TS + JSON Schema + migradores de version
│  ├─ viewer/            # Motor 360 (TS + WebGL, base Marzipano con capas propias)
│  ├─ viewer-ui/         # Skin del visor (Web Components, framework-agnostic)
│  ├─ tiler/             # Tiling en navegador (WebWorkers) y en Node (sharp)
│  ├─ exporter/          # Generador de paquetes estaticos/SCORM (browser + Node)
│  ├─ adapters/          # Interfaces + impl. cloudflare/ y node/
│  ├─ db/                # Esquema Drizzle ORM + migraciones (D1 y SQLite)
│  └─ ui/                # Design system del Studio (Radix + Tailwind, tema ULL)
├─ deploy/
│  ├─ cloudflare/        # wrangler.jsonc, script bootstrap
│  └─ docker/            # Dockerfile unico, docker-compose.yml, Caddyfile
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

## Documentacion

La documentacion completa (manual de usuario, guia de administracion, guias de despliegue, referencia OpenAPI, formato tour.json y tutoriales) vive en `apps/docs` y se publica junto con la instancia en `/docs`.

## Licencia

[EUPL-1.2](LICENSE). Titularidad del codigo: Universidad de La Laguna. Los medios de ejemplo se publican bajo CC BY 4.0. Vease [AUTHORS](AUTHORS).

## Seguridad

Divulgacion responsable de vulnerabilidades: vease [SECURITY.md](SECURITY.md).
