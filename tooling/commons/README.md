# Tours de monumentos desde Wikimedia Commons

Herramientas para montar tours de lugares conocidos a partir de panorámicas
esféricas libres de Wikimedia Commons y publicarlos en la galería pública
(`/explorar/`). La razón está en `docs/seo/ESTUDIO-RESULTADOS.md`, §3 y §9:
cada tour público de un lugar conocido es una página que posiciona por el
nombre del lugar, y los competidores viven de eso.

## Flujo completo

```
inventario.py  →  proponer-encargos.py  →  escribir los textos  →  montar-monumento.mjs
(Commons)         (Commons × demanda)      (a mano, sin inventar)   (proyecto + publicación)
```

1. **Inventario de panorámicas libres.** `python3 tooling/commons/inventario.py [máx. categorías]`
   recorre el árbol de «Category:360° panoramas» de Commons y guarda en
   `docs/seo/datos/commons/inventario.jsonl` (ignorado por git) una línea por
   fichero equirectangular 2:1 de al menos 4000 px con licencia libre:
   `titulo`, `url`, `ancho`, `alto`, `licencia`, `autor`, `pagina`, `categorias`.
   Es reanudable: cada ejecución añade categorías nuevas. Para un lugar suelto,
   `python3 tooling/commons/buscar_panoramas.py "louvre"` escribe
   `docs/seo/datos/commons/louvre.json`.

2. **Proponer encargos.** `python3 tooling/commons/proponer-encargos.py`
   cruza el inventario con la demanda medida por la sonda de monumentos
   (`docs/seo/monumentos.json` y `docs/seo/datos/monumentos_{mercado}.json`) y
   escribe un encargo por lugar con al menos tres panorámicas que coincidan
   por nombre (en el título o las categorías del fichero) en
   `tooling/commons/encargos/{slug}.json`, con el idioma del mercado que más
   busca y las panorámicas más anchas primero. Imprime la lista ordenada por
   búsquedas al mes. No pisa un encargo que ya exista salvo con `--forzar`.
   Opciones: `--inventario`, `--minimo`, `--max-escenas`, `--salida`.

3. **Escribir los textos.** Todo lo que el generador deja marcado `TODO` hay que
   escribirlo a mano: `title` (título SEO con el nombre del lugar, 3 a 120
   caracteres), `description` (un párrafo de 300 a 600 caracteres),
   `placeName` con su forma oficial y sus acentos, `placeCountry` (ISO-2),
   `lat`/`lng`, y por escena `title`, `alt` (texto alternativo accesible) y
   `desc`. Solo hechos comprobados: el texto de la ficha es lo que Google
   indexa y lo que lee una persona. Quita las escenas que no sean del lugar.
   El montaje se niega a publicar mientras quede algún `TODO`.

4. **Montar y publicar.**
   ```
   ANDARAMA_TOKEN=andarama_... node tooling/commons/montar-monumento.mjs tooling/commons/encargos/{slug}.json
   ```
   Descarga cada panorama a `tooling/commons/cache/` (ignorada por git),
   comprueba que es 2:1 y de al menos 4000 px (si supera 16 384 px lo reduce
   con `sharp`, que viene con `packages/tiler`), crea el proyecto, sube los
   originales con el flujo prefirmado de la API, genera los tiles con el tiler
   Node del repo, crea las escenas con título, texto alternativo y descripción,
   añade los hotspots de navegación, un panel de créditos en la escena inicial
   y publica con `visibility: "public"` y la ficha de la galería. Al final
   comprueba que `/explorar/{slug}/` responde 200 con el título y el JSON-LD.
   Con `--dry-run` solo descarga y comprueba, sin tocar la instancia.

   Hace falta el tiler compilado: `pnpm install && pnpm build:packages` en la
   raíz del repo. No usa ninguna dependencia fuera del repo.

### Formato del encargo

```json
{
  "slug": "hamburgo-poly-haven",
  "lang": "es",
  "title": "Hamburgo en 360: estación central, Hansaplatz y un canal de la ciudad",
  "description": "Un párrafo de 300 a 600 caracteres…",
  "placeName": "Hamburgo",
  "placeCountry": "DE",
  "lat": 53.5528,
  "lng": 10.0067,
  "startScene": "estacion-central",
  "scenes": [
    {
      "id": "estacion-central",
      "file": "https://upload.wikimedia.org/wikipedia/commons/…/Hamburg_hbf….jpg",
      "commonsPage": "https://commons.wikimedia.org/wiki/File:Hamburg_hbf….jpg",
      "title": "Estación central de Hamburgo",
      "alt": "Panorámica esférica del interior de la estación central de Hamburgo",
      "desc": "Estación central de Hamburgo (Hauptbahnhof). Vista esférica completa.",
      "view": { "yaw": 0, "pitch": 0.05, "fov": 1.2 }
    }
  ],
  "links": [{ "from": "estacion-central", "to": "hansaplatz", "yaw": 0.4, "pitch": -0.05, "label": "Ir a la Hansaplatz" }]
}
```

- `file` es la URL del original en `upload.wikimedia.org` (o la reducida a
  8192 px que da la API de Commons). Si falta, se toma de `commonsPage`.
- `commonsPage` es obligatoria: de ahí salen el autor y la licencia (con
  `author` y `license` en la escena se pueden corregir a mano).
- `links` es opcional. Sin él, las escenas se encadenan en anillo: un hotspot
  con yaw 0 hacia la siguiente y otro con yaw π hacia la anterior. Con las
  posiciones reales elegidas sobre cada panorama el tour queda mucho mejor.
- `view` (vista inicial) y `category` son opcionales.
- El ejemplo completo está en `encargos/ejemplo-poly-haven.json` (tres
  panorámicas CC0 de Poly Haven en Hamburgo).

### Idempotencia

Si el `slug` ya está publicado por un proyecto de la organización, el script
reutiliza ese proyecto: sustituye sus escenas y hotspots por los del encargo
y publica una versión nueva con el mismo slug (la API conserva la ficha y el
historial de versiones). Los medios se deduplican por SHA-256, así que
repetir el montaje no vuelve a subir ni a tilear los panoramas. El encargo es
la fuente de verdad: lo que se haya retocado a mano en el Studio en ese
proyecto se pierde al volver a montarlo.

## Variables de entorno y opciones

| Variable / opción | Uso |
|---|---|
| `ANDARAMA_TOKEN` | Token personal `andarama_…` (Bearer). Necesita los scopes `projects:read`, `projects:write`, `media:write` y `publish`. |
| `ANDARAMA_BASE` | Instancia; por defecto `https://app.andarama.com`. También `--base URL`. |
| `ANDARAMA_ORG` | Organización (id o slug) si el usuario tiene varias; por defecto la primera. También `--org`. |
| `--email` y `--password` | Sesión con cookie cuando no hay token (self-host). Si el inicio de sesión falla, registra el usuario. |
| `--dry-run` | Descarga y comprueba los panoramas, imprime los créditos y no toca la instancia. |
| `--no-verify` | No comprobar la ficha servida al terminar. |

### Cómo obtener el token en el Studio

Studio → menú de la cuenta (`/account`) → **Tokens de API** → **Crear token**
con nombre y scopes `projects:read`, `projects:write`, `media:write` y
`publish`. El token se muestra una sola vez; guárdalo como `ANDARAMA_TOKEN`.
En la instancia alojada, el Studio vive en `https://app.andarama.com`; en el
self-host, en `{PUBLIC_URL}/studio/`.

## Atribución y licencias

Solo entran en el inventario ficheros con licencia **CC0**, **CC BY** o
**CC BY-SA** (o dominio público). Se excluyen NC, ND y «fair use». Lo que
exige cada una:

| Licencia | Qué exige | Qué hace el script |
|---|---|---|
| **CC0 / dominio público** | Nada. Es de cortesía citar al autor. | Cita igualmente autor, licencia y página de Commons. |
| **CC BY** | Atribuir al autor, indicar la licencia y enlazar a la obra original; señalar si se ha modificado (reducir o tilear cuenta como modificación técnica, se indica implícitamente al enlazar el original). | Créditos por escena en la ficha y en el panel «Créditos» del tour, con enlace a la página de Commons y a la licencia. |
| **CC BY-SA** | Lo mismo que CC BY **y** compartir cualquier obra derivada con la misma licencia. Un tour que solo reproduce la fotografía no es una adaptación de la foto; si se retoca la imagen (recorte, color) el resultado debe ir en CC BY-SA. | Igual que CC BY. No retoca la imagen salvo reducirla de tamaño. |

El texto de atribución por escena es siempre:

```
{título de la escena}. Fotografía: {autor}, {licencia}, Wikimedia Commons ({página})
```

y va en tres sitios: los créditos de la ficha de la galería (`gallery.credits`,
límite de 1000 caracteres; si no caben se agrupan por autor y licencia), el
autor del tour (`meta.author`, en los ajustes del proyecto) y un panel de
texto «Créditos» en la escena inicial, con enlaces, sin límite de longitud.
Las etiquetas visibles («Ir a…», «Créditos», «Fotografía») salen en el idioma
del encargo (es, en, fr, de, it, pt; para otros idiomas, en español).

## Ficheros

- `inventario.py`: inventario completo de panorámicas libres de Commons.
- `buscar_panoramas.py`: búsqueda por lugar.
- `proponer-encargos.py`: inventario × demanda → encargos con plantillas `TODO`.
- `montar-monumento.mjs`: encargo → proyecto publicado en la galería.
- `encargos/`: un JSON por lugar. `ejemplo-poly-haven.json` es el de prueba.
- `cache/`: descargas y metadatos de Commons (ignorada por git).
