---
title: Guía de administración
---

El primer usuario registrado es **administrador de la instancia** y ve la sección **Administración** del Studio.

## Ajustes de instancia

- **Nombre y logo** de la instancia.
- **Política de registro**: abierto, solo por invitación, o por dominio de email (p. ej. `ull.edu.es`).
- **Límite de subida** (MB) y **retención de la papelera** (días; 30 por defecto).
- **Cuotas por defecto** de nuevas organizaciones (almacenamiento y número de tours) y ajuste individual por organización.
- **Textos legales**: privacidad, cookies, términos.

## Usuarios y organizaciones

Listado de usuarios (rol global admin/user, 2FA, SSO), cuotas por organización con uso real, y listado de todos los tours publicados con su visibilidad.

## Autenticación

- **Email + contraseña** con verificación (si hay transporte de email configurado; sin él, alta directa).
- **SSO institucional OIDC**: configura `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` y opcionalmente `OIDC_ALLOWED_DOMAINS` (alta JIT automática por dominio). Para IdP solo-SAML, el patrón soportado es un puente SAML-OIDC (Keycloak o similar) delante del IdP.
- **2FA TOTP** opcional por usuario (aplicación de autenticación).

## Cola de trabajos

Los trabajos pesados (tiles de imágenes gigantes, transcodificación) aparecen en **Cola de trabajos** con reintento manual. En self-host los procesa el propio proceso; en Cloudflare los procesa el contenedor de procesado opcional (la CLI `ull360-tile` del paquete `@ull360/tiler`).

## Auditoría

Registro de auditoría de acciones sensibles: quién publicó, despublicó, borró, cambió roles o ajustes, y cuándo.

## Webhooks

Suscripción de sistemas externos a eventos `publish`, `unpublish` y `form_submission`, con firma HMAC opcional (`X-ULL360-Signature`).

## Copias de seguridad

- **Cloudflare**: D1 tiene Time Travel de 30 días. Además, descarga la copia completa desde Administración, Copia de seguridad (JSON con todas las tablas) y sincroniza el bucket R2 con `rclone`/`aws s3 sync`.
- **Self-host**: `deploy/docker/backup.sh` hace una copia consistente de SQLite (VACUUM INTO) y de los medios; prográmalo con cron. Para replicación continua, considera litestream.
- **Portabilidad de un tour**: cada proyecto puede exportarse como fichero `.ull360` (estructura completa sin binarios) e importarse en otra instancia.
