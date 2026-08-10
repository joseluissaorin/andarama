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

## Valores por defecto de la organización

Los ajustes se resuelven en cascada:

`instancia → organización → usuario → plantilla → tour`

Cada nivel solo fija lo que le importa y lo demás lo hereda del anterior. En
**Ajustes de la organización** un administrador de la facultad define de una vez
el tema y el color, la tipografía, los idiomas, la autoría, la transición por
defecto y el comportamiento en gafas. Todo tour nuevo nace con eso puesto.

Al guardar, los cambios **se propagan a los borradores** que no habían
personalizado esa clave —eso es lo que significa heredar— y se indica a cuántos
ha llegado. Los tours **ya publicados no cambian**: son instantáneas compiladas
y siguen viéndose igual hasta que alguien los vuelva a publicar. Un tour que
personaliza un valor deja de seguir a la organización en esa clave concreta.

Cada persona tiene además sus propias preferencias (idioma del editor, idioma
por defecto de los tours que crea), que se aplican después de las de la
organización.

## Realidad virtual en la instancia

No hay nada que activar: la realidad virtual es parte del visor y funciona en
todos los tours. Lo único que la condiciona es el alojamiento.

- **HTTPS obligatorio.** WebXR solo existe en contextos seguros. Una instancia
  servida por `http://` mostrará el botón, pero entrará en modo cardboard. Con
  dominio propio para un tour, el certificado lo emite Cloudflare
  automáticamente (véase «Dominio propio para un tour»).
- **Embebidos.** Si los tours se insertan en el portal de la universidad, el
  iframe necesita `allow="xr-spatial-tracking"`; el código que genera el Studio
  ya lo incluye.
- **Gafas compartidas** (aulas, jornadas de puertas abiertas): conviene publicar
  el tour como **kiosko** y abrirlo en el navegador de las gafas con la sesión
  ya iniciada. El modo VR no requiere cuenta ni permisos adicionales.
- **Analítica.** Entrar en modo inmersivo se registra como evento `vr`, de modo
  que el panel de analítica distingue las visitas con gafas.
- **Qué se acciona en gafas** se decide por tour (o por organización, como valor
  por defecto): todos los hotspots, solo la navegación o una selección.
- Los tours exportados conservan la realidad virtual, pero solo entran en modo
  inmersivo si se suben a un alojamiento con HTTPS.

## Copias de seguridad

- **Cloudflare**: D1 tiene Time Travel de 30 días. Además, descarga la copia completa desde Administración, Copia de seguridad (JSON con todas las tablas) y sincroniza el bucket R2 con `rclone`/`aws s3 sync`.
- **Self-host**: `deploy/docker/backup.sh` hace una copia consistente de SQLite (VACUUM INTO) y de los medios; prográmalo con cron. Para replicación continua, considera litestream.
- **Portabilidad de un tour**: cada proyecto puede exportarse como fichero `.ull360` (estructura completa sin binarios) e importarse en otra instancia.
