---
title: Seguridad y RGPD
---

## Medidas implementadas

- **HTTPS** obligatorio con HSTS; **CSP estricta** con nonces (sin `unsafe-inline` en scripts); `frame-ancestors` segun la configuracion de embebido de cada tour; sandbox estricto en iframes de hotspots web.
- **Sesiones** con cookies HttpOnly + Secure + SameSite=Lax y **CSRF de doble token** en todas las mutaciones.
- **Contrasenas**: Argon2id en self-host; en Cloudflare Workers se usa PBKDF2-SHA256 (100.000 iteraciones, el maximo que permite WebCrypto en Workers) porque la plataforma no permite compilar WASM en tiempo de ejecucion y el coste de CPU de Argon2 excede los limites del free tier. La verificacion acepta ambos formatos.
- **Rate limiting** en login, registro, restablecimiento, formularios publicos e ingesta de analitica; **Turnstile** en formularios publicos.
- **Autorizacion en servidor** en cada operacion; IDs no adivinables.
- **Validacion de contenido**: tipo real por magic bytes, saneado de SVG en servidor, Markdown renderizado con lista blanca (nunca se interpreta HTML de entrada), CSS de autor saneado.
- **Auditoria** de acciones sensibles y **tokens de API con scopes** revocables.
- Dependencias auditadas en CI (npm audit + OSV) con Renovate recomendado.

## RGPD

- **Analitica sin cookies**: identificador de sesion efimero (se descarta al cerrar la pestana), IP nunca almacenada (hash con sal diaria solo para rate limiting anti-abuso), datos agregados.
- Integraciones GA4/Matomo **desactivadas por defecto** y bajo responsabilidad del autor del tour.
- Derecho de supresion: eliminar un usuario borra sus datos personales; los envios de formularios pueden purgarse desde el panel del proyecto.
- Para el despliegue Cloudflare, la ULL debe formalizar el DPA estandar de Cloudflare (disponible en su dashboard) como encargado de tratamiento.

## Divulgacion responsable

Consulta `SECURITY.md` en el repositorio: canal de contacto, plazos de respuesta y ambito.
