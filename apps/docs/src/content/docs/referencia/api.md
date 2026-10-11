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
- **Token personal** (automatización/CI): `Authorization: Bearer andarama_...` con scopes (`projects:read`, `projects:write`, `media:read`, `media:write`, `publish`, `orgs:write`, `admin`). Se crean en Studio, cuenta, Tokens de API.

Los errores siguen **RFC 9457** (`application/problem+json`). La API está versionada por prefijo (`/api/v1`).

## Publicar desde CI

```bash
TOKEN="andarama_..."
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
| `/api/v1/auth/*`, `/api/v1/me` | Registro, login, OIDC, TOTP, restablecimiento y **preferencias personales** (`/me/prefs`) |
| `/api/v1/orgs/*` | Organizaciones, miembros, invitaciones, uso y **valores por defecto** (`/defaults`) |
| `/api/v1/projects/*` | Proyectos, escenas, hotspots, traducciones, comentarios, compile, publish, versiones, export, analítica, envíos |
| `/api/v1/media/*` | Subidas multiparte prefirmadas, derivados, **tiles de un medio** (`/{id}/tiles/*`), **carpetas** (`/folders`), procesado |
| `/api/v1/lti/*` | LTI 1.3: login, launch, deep linking, JWKS, registros |
| `/api/v1/admin/*` | Administración de instancia y copias de seguridad |
| `/api/v1/live/*` | Salas de visita guiada |
| `/t/{slug}` | Visor publicado (sirve desde almacenamiento con caché) |
| `/ingest/e` | Ingesta de analítica sin cookies |
| `/rt/project/{id}`, `/rt/live/{room}` | WebSockets de edición en grupo y visitas en vivo |

## Edición en grupo y versiones

Varias personas pueden editar el mismo recorrido a la vez. La API sigue siendo
la fuente de la verdad; el tiempo real solo avisa.

- **Versiones.** Cada escena y cada hotspot llevan `version`, y el proyecto,
  `settingsVersion`. Suben con cada cambio. `PATCH /projects/{id}/scenes/{sceneId}`
  y `PATCH /projects/{id}/hotspots/{hotspotId}` aceptan `baseVersion`, y
  `PATCH /projects/{id}` acepta `baseSettingsVersion`. Si no coincide con la
  vigente, la respuesta es **409** con `code: "version_conflict"`, `entity` y
  `current` (la fila o los ajustes vigentes): el cliente fusiona y vuelve a
  guardar. Sin estos campos se guarda como siempre. Las respuestas devuelven la
  versión nueva.
- **Sala.** `POST /projects/{id}/realtime` da un billete firmado de dos minutos
  a quien puede editar el recorrido (colaborador o más). Con él se abre
  `/rt/project/{id}?t=<billete>`. La sala manda `welcome`, `presence` (personas,
  escena, panel abierto y bloqueos blandos), `view` (dónde mira cada uno) y
  `changed`, que es el aviso que la API difunde tras cada escritura correcta:
  `scene`/`hotspot` con `op: "upsert"` y la fila, u `op: "delete"`; `order`,
  `settings`, `project`, `translations`, `comments` y `publication`. El cliente
  manda `where`, `view` y `"ping"` (respuesta `"pong"`). Si una escritura lleva
  la cabecera `x-andarama-conn` con el identificador de la conexión, el aviso
  lo incluye en `origin`.

## Cambios recientes

- **Las conexiones del grafo ya no existen** como entidad propia
  (`POST/PATCH/DELETE /projects/{id}/connections`): una arista **es** un
  hotspot de navegación, así que se crean y se borran como hotspots. Los
  documentos de importación anteriores que las traigan se aceptan y se ignoran.
- `GET /projects/{id}/scenes` devuelve `{ scenes, hotspots }`; ya no incluye
  `connections`.
- `GET /media/{id}/tiles/*` sirve los tiles de un panorama de la biblioteca
  aunque no pertenezca a ningún tour: es lo que permite previsualizarlo en 360
  antes de convertirlo en escena.
- `GET|PUT /orgs/{id}/defaults` y `PUT /me/prefs` alimentan la cascada de
  valores por defecto.
