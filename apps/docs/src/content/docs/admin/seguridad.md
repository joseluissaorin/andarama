---
title: Seguridad y RGPD
---

## Medidas implementadas

- **HTTPS** obligatorio con HSTS; **CSP estricta** con nonces (sin `unsafe-inline` en scripts); `frame-ancestors` según la configuración de embebido de cada tour; sandbox estricto en iframes de hotspots web.
- **Sesiones** con cookies HttpOnly + Secure + SameSite=Lax y **CSRF de doble token** en todas las mutaciones.
- **Contraseñas**: Argon2id en self-host; en Cloudflare Workers se usa PBKDF2-SHA256 (100.000 iteraciones, el máximo que permite WebCrypto en Workers) porque la plataforma no permite compilar WASM en tiempo de ejecución y el coste de CPU de Argon2 excede los límites del free tier. La verificación acepta ambos formatos.
- **Rate limiting** en login, registro, restablecimiento, formularios públicos e ingesta de analítica; **Turnstile** en formularios públicos.
- **Autorización en servidor** en cada operación; IDs no adivinables.
- **Validación de contenido**: tipo real por magic bytes, saneado de SVG en servidor, Markdown renderizado con lista blanca (nunca se interpreta HTML de entrada), CSS de autor saneado.
- **Auditoría** de acciones sensibles y **tokens de API con scopes** revocables.
- Dependencias auditadas en CI (npm audit + OSV) con Renovate recomendado.

## RGPD

- **Analítica sin cookies**: identificador de sesión efímero (se descarta al cerrar la pestaña), IP nunca almacenada (hash con sal diaria solo para rate limiting anti-abuso), datos agregados.
- Integraciones GA4/Matomo **desactivadas por defecto** y bajo responsabilidad del autor del tour.
- **Derecho de supresión**: eliminar un usuario borra sus datos personales; los envíos de formularios pueden purgarse desde el panel del proyecto. En la instancia alojada, cuando alguien borra su cuenta en Clerk, el webhook `user.deleted` borra las organizaciones en las que era el único miembro (proyectos, publicaciones, dominios, medios del almacenamiento, formularios y resultados), le retira de las compartidas (responde de ellas otro administrador) y deja sus comentarios sin autor. Queda en la auditoría como `user.deleted`. La configuración está en [Despliegue en Cloudflare](/docs/despliegue/cloudflare/#webhook-de-clerk).
- **Portabilidad**: el administrador de una organización descarga todos sus datos en un ZIP (véase la [guía de administración](/docs/admin/guia/#exportación-completa-de-una-organización)).
- **Administradores**: solo las direcciones de `ADMIN_EMAILS` administran la instancia, y todo cambio de rol queda auditado como `admin.role_change`.
- Para el despliegue Cloudflare, la ULL debe formalizar el DPA estándar de Cloudflare (disponible en su dashboard) como encargado de tratamiento.

## Divulgación responsable

Consulta `SECURITY.md` en el repositorio: canal de contacto, plazos de respuesta y ámbito.
