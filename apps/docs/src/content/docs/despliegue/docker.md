---
title: Self-host con Docker
---

Una unica imagen (Node.js + SQLite + sistema de ficheros), un volumen (`/data`), un puerto (8788). Requisitos minimos: **1 vCPU / 1 GB RAM**.

## Arranque

```bash
curl -O https://raw.githubusercontent.com/ull/ull360/main/deploy/docker/docker-compose.yml
echo "APP_SECRET=$(openssl rand -hex 32)" > .env
echo "PUBLIC_URL=http://localhost:8788" >> .env
docker compose up -d
```

Abre `http://localhost:8788/studio/` y registra el primer usuario (sera administrador).

## Variables de entorno

| Variable | Descripcion |
|---|---|
| `APP_SECRET` | Obligatoria. Secreto de instancia (`openssl rand -hex 32`) |
| `PUBLIC_URL` | URL publica (obligatoria detras de proxy/TLS) |
| `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM` | Email transaccional (opcional; sin el, modo log) |
| `OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET/ALLOWED_DOMAINS` | SSO institucional (opcional) |
| `S3_ENDPOINT/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY` | Almacenamiento S3/MinIO en lugar del FS local (opcional) |
| `TURNSTILE_SITE_KEY/SECRET` | Anti-spam en formularios (opcional) |

## TLS automatico

Descomenta el servicio `caddy` del compose, edita `Caddyfile` con tu dominio y fija `PUBLIC_URL=https://tu-dominio`.

## Equivalencias con Cloudflare

D1 se convierte en SQLite (fichero), R2 en sistema de ficheros o S3/MinIO, KV en tabla SQLite, Queues en cola en proceso persistida, Durable Objects en servidor ws integrado y Analytics Engine en tabla SQLite. **El mismo binario sirve Studio, API, visor y tiempo real.**

## Actualizacion

```bash
docker compose pull && docker compose up -d
```

Las migraciones se aplican automaticamente al arrancar, con copia de seguridad previa de la base de datos en `/data`.

## Copias de seguridad

`deploy/docker/backup.sh <destino>` hace una copia consistente de SQLite (VACUUM INTO) y sincroniza los medios. Programalo con cron; para replicacion continua considera litestream.
