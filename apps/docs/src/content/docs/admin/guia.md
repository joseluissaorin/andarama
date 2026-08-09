---
title: Guia de administracion
---

El primer usuario registrado es **administrador de la instancia** y ve la seccion **Administracion** del Studio.

## Ajustes de instancia

- **Nombre y logo** de la instancia.
- **Politica de registro**: abierto, solo por invitacion, o por dominio de email (p. ej. `ull.edu.es`).
- **Limite de subida** (MB) y **retencion de la papelera** (dias; 30 por defecto).
- **Cuotas por defecto** de nuevas organizaciones (almacenamiento y numero de tours) y ajuste individual por organizacion.
- **Textos legales**: privacidad, cookies, terminos.

## Usuarios y organizaciones

Listado de usuarios (rol global admin/user, 2FA, SSO), cuotas por organizacion con uso real, y listado de todos los tours publicados con su visibilidad.

## Autenticacion

- **Email + contrasena** con verificacion (si hay transporte de email configurado; sin el, alta directa).
- **SSO institucional OIDC**: configura `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` y opcionalmente `OIDC_ALLOWED_DOMAINS` (alta JIT automatica por dominio). Para IdP solo-SAML, el patron soportado es un puente SAML-OIDC (Keycloak o similar) delante del IdP.
- **2FA TOTP** opcional por usuario (aplicacion de autenticacion).

## Cola de trabajos

Los trabajos pesados (tiles de imagenes gigantes, transcodificacion) aparecen en **Cola de trabajos** con reintento manual. En self-host los procesa el propio proceso; en Cloudflare los procesa el contenedor de procesado opcional (la CLI `ull360-tile` del paquete `@ull360/tiler`).

## Auditoria

Registro de auditoria de acciones sensibles: quien publico, despublico, borro, cambio roles o ajustes, y cuando.

## Webhooks

Suscripcion de sistemas externos a eventos `publish`, `unpublish` y `form_submission`, con firma HMAC opcional (`X-ULL360-Signature`).

## Copias de seguridad

- **Cloudflare**: D1 tiene Time Travel de 30 dias. Ademas, descarga la copia completa desde Administracion, Copia de seguridad (JSON con todas las tablas) y sincroniza el bucket R2 con `rclone`/`aws s3 sync`.
- **Self-host**: `deploy/docker/backup.sh` hace una copia consistente de SQLite (VACUUM INTO) y de los medios; programalo con cron. Para replicacion continua, considera litestream.
- **Portabilidad de un tour**: cada proyecto puede exportarse como fichero `.ull360` (estructura completa sin binarios) e importarse en otra instancia.
