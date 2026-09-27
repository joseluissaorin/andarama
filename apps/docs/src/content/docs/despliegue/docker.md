---
title: Self-host (Docker)
---

Una única imagen (Node.js + SQLite + sistema de ficheros), un volumen (`/data`), un puerto (8788). Requisitos mínimos: **1 vCPU / 1 GB RAM**. El `docker-compose.yml`, el `Dockerfile`, el `Caddyfile`, el script de copias y la plantilla `.env.example` están en [`deploy/docker`](https://github.com/joseluissaorin/andarama/tree/main/deploy/docker) del repositorio.

Esta página es la referencia. Para instalarlo paso a paso en un servidor con dominio y HTTPS, sigue [Instalación en un servidor propio](/docs/despliegue/servidor-propio/). Para un solo ordenador, sin Docker, existe el [ejecutable de escritorio](/docs/despliegue/escritorio/): mismos datos, mismo esquema.

## Arranque

Mientras la imagen no esté publicada en `ghcr.io/joseluissaorin/andarama`, se construye desde el código:

```bash
git clone https://github.com/joseluissaorin/andarama.git
cd andarama/deploy/docker
cp .env.example .env
sed -i "s/^APP_SECRET=.*/APP_SECRET=$(openssl rand -hex 32)/" .env
sed -i "s#^PUBLIC_URL=.*#PUBLIC_URL=http://localhost:8788#" .env
docker compose up -d --build
```

Abre `http://localhost:8788/studio/` y registra el primer usuario. Si `ADMIN_EMAILS` tiene correos, solo esas direcciones serán administradoras; si está vacía, lo será el primer usuario registrado.

Con la imagen publicada, basta con el compose y el `.env` (sin `build`, sin clonar): `docker compose pull && docker compose up -d`.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `APP_SECRET` | Obligatoria. Secreto de instancia (`openssl rand -hex 32`) |
| `PUBLIC_URL` | URL pública (obligatoria detrás de proxy/TLS) |
| `ADMIN_EMAILS` | Recomendada. Correos de los administradores de la instancia, separados por comas; sin ella, el primer usuario registrado es el administrador |
| `DOMINIO` | Dominio que sirve Caddy con HTTPS (perfil `https`) |
| `ANDARAMA_BIND`, `ANDARAMA_PORT` | Dirección y puerto del host donde se publica el 8788 (`127.0.0.1` detrás de un proxy) |
| `ANDARAMA_IMAGE` | Imagen a usar (por defecto `ghcr.io/joseluissaorin/andarama:latest`) |
| `SMTP_HOST/PORT/SECURE/USER/PASS`, `EMAIL_FROM` | Correo transaccional (opcional; sin él, modo registro) |
| `OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET/ALLOWED_DOMAINS` | SSO institucional (opcional) |
| `S3_ENDPOINT/BUCKET/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY` | Almacenamiento S3/MinIO en lugar del disco local (opcional) |
| `TURNSTILE_SITE_KEY/SECRET` | Antispam en formularios (opcional) |
| `ADMIN_EMAILS` | Administradores de la instancia, separados por comas (recomendada). Vacía y sin Clerk: el primer usuario registrado administra |
| `SHOW_LANDING` | `1` para servir en `/` la portada de andarama.com; por defecto `/` lleva al Studio |
| `CLERK_PUBLISHABLE_KEY/SECRET_KEY` | Cuentas y planes con Clerk, como en andarama.com (opcional; la instalación propia no lo necesita) |
| `CLERK_WEBHOOK_SECRET` | Secreto de firma del [webhook de Clerk](/docs/despliegue/cloudflare/#webhook-de-clerk) (solo con Clerk) |

En `deploy/docker/.env.example` están todas, comentadas: cópialo como `.env` y rellena lo que uses. Una variable vacía cuenta como no definida.

## TLS automático

Pon `DOMINIO` y `PUBLIC_URL=https://…` en el `.env` y arranca con el perfil `https`, que añade Caddy con certificados de Let's Encrypt:

```bash
docker compose --profile https up -d --build
```

## Equivalencias con Cloudflare

D1 se convierte en SQLite (fichero), R2 en sistema de ficheros o S3/MinIO, KV en tabla SQLite, Queues en cola en proceso persistida, Durable Objects en servidor ws integrado y Analytics Engine en tabla SQLite. **El mismo binario sirve Studio, API, visor, galería, documentación y tiempo real.**

## Actualización

```bash
git pull && docker compose up -d --build        # desde el código
docker compose pull && docker compose up -d     # con la imagen publicada
```

Las migraciones se aplican automáticamente al arrancar, con copia de seguridad previa de la base de datos en `/data`.

## Copias de seguridad

`deploy/docker/backup.sh <destino>` hace una copia consistente de SQLite (VACUUM INTO) y copia los medios, sin parar el servicio. Prográmalo con cron; la restauración está en [Instalación en un servidor propio](/docs/despliegue/servidor-propio/#7-copias-de-seguridad). Para replicación continua, considera litestream.
