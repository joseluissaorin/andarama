---
title: Despliegue en Cloudflare
---

Objetivo: **de cero a instancia funcionando en menos de 10 minutos** con una cuenta gratuita de Cloudflare.

## Requisitos

- Node.js 20+ y pnpm 10+
- Cuenta de Cloudflare (el free tier basta para usos pequeños y medios)

## Un comando

```bash
git clone https://github.com/ull/ull360 && cd ull360
pnpm install
pnpm deploy:cloudflare
```

El script bootstrap (interactivo e idempotente):

1. Comprueba la autenticación de wrangler (abre `wrangler login` si hace falta).
2. Crea la base **D1** `ull360` y aplica las migraciones.
3. Crea el bucket **R2** `ull360` y el namespace **KV**.
4. Genera y guarda el secreto **APP_SECRET**; pregunta por los opcionales (email, Turnstile, SSO).
5. Compila los paquetes, el visor y el Studio, y **despliega el Worker** con los assets.

Todo queda descrito en `deploy/cloudflare/wrangler.jsonc` (infraestructura como código). Actualizar la instancia = volver a ejecutar `pnpm deploy:cloudflare`.

Tras el primer despliegue: abre la URL `*.workers.dev` mostrada, registra el primer usuario (será administrador) y fija `PUBLIC_URL` en las vars de `wrangler.jsonc`.

## Qué usa cada capacidad

| Capacidad | Servicio |
|---|---|
| HTTP + estáticos | Worker + Workers Assets |
| Base de datos | D1 (Time Travel 30 días) |
| Medios y tiles | R2 (+ caché CDN) |
| Sesiones/caché | KV |
| Tiempo real | Durable Objects (SQLite-backed, free tier) |
| Analítica | Workers Analytics Engine o tabla D1 (`ANALYTICS_BACKEND=d1`, por defecto) |
| Colas | Cloudflare Queues (opcional, plan Paid) o tabla `jobs` + runner |
| Anti-bots | Turnstile (opcional) |

## Opciones avanzadas

- **Dominio propio**: añade `routes` en `wrangler.jsonc` y actualiza `PUBLIC_URL`.
- **Subidas prefirmadas S3**: crea un token R2 (Panel R2, Manage API Tokens) y define los secretos `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` y `CF_ACCOUNT_ID`. Sin ellos, las subidas pasan por el Worker en streaming (funciona igualmente).
- **Analytics Engine con consultas**: define `ANALYTICS_BACKEND=ae` y los secretos `CF_ACCOUNT_ID` + `CF_ANALYTICS_TOKEN` (token con permiso Account Analytics Read).
- **Cloudflare Stream** para video: `STREAM_ACCOUNT_ID` + `STREAM_API_TOKEN`.
- **Contenedor de procesado** (imágenes más allá de la capacidad del navegador): ejecuta el runner en cualquier máquina con acceso a la API usando la CLI `ull360-tile`, o despliega la imagen Docker como Cloudflare Container asociado a la cola.
- **Email transaccional**: `EMAIL_WEBHOOK_URL`/`EMAIL_WEBHOOK_KEY` compatibles con la API de Resend.
