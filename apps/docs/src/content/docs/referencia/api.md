---
title: API REST
---

La especificación **OpenAPI 3.1 completa** se sirve en cada instancia en:

```
GET /api/v1/openapi.json
```

Puedes explorarla con cualquier visor OpenAPI (Swagger UI, Scalar, Redocly).

## Autenticación

- **Sesión** (Studio): cookie HttpOnly + cabecera `X-CSRF-Token` en mutaciones.
- **Token personal** (automatización/CI): `Authorization: Bearer ull360_...` con scopes (`projects:read`, `projects:write`, `media:read`, `media:write`, `publish`, `orgs:write`, `admin`). Se crean en Studio, cuenta, Tokens de API.

Los errores siguen **RFC 9457** (`application/problem+json`). La API está versionada por prefijo (`/api/v1`).

## Publicar desde CI

```bash
TOKEN="ull360_..."
BASE="https://tu-instancia"
PROJECT="id-del-proyecto"

curl -s -X POST "$BASE/api/v1/projects/$PROJECT/publish" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"note": "publicación desde CI"}'
```

## Grupos de rutas

| Prefijo | Contenido |
|---|---|
| `/api/v1/auth/*`, `/api/v1/me` | Registro, login, OIDC, TOTP, restablecimiento |
| `/api/v1/orgs/*` | Organizaciones, miembros, invitaciones, uso |
| `/api/v1/projects/*` | Proyectos, escenas, hotspots, conexiones, traducciones, comentarios, compile, publish, versiones, export, analítica, envíos |
| `/api/v1/media/*` | Subidas multiparte prefirmadas, derivados/tiles, procesado |
| `/api/v1/lti/*` | LTI 1.3: login, launch, deep linking, JWKS, registros |
| `/api/v1/admin/*` | Administración de instancia y copias de seguridad |
| `/api/v1/live/*` | Salas de visita guiada |
| `/t/{slug}` | Visor publicado (sirve desde almacenamiento con caché) |
| `/ingest/e` | Ingesta de analítica sin cookies |
| `/rt/project/{id}`, `/rt/live/{room}` | WebSockets de presencia y visitas en vivo |
