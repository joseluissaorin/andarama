# Tubería de traducción de la interfaz

`traducir.py` produce los diccionarios de interfaz del Studio y del visor en
los 32 idiomas de las apps móviles a partir del español (`es.json`, la fuente)
con el inglés (`en.json`) como referencia de sentido. Llama al modelo barato de
OpenRouter por medio de la skill `openrouter` (`~/.claude/skills/openrouter/scripts/or.py`);
la clave vive en `~/.claude/.secrets/openrouter.env` y nunca se imprime.

## Uso

```bash
# Studio (apps/studio/src/i18n/{lang}.json)
python3 tooling/i18n/traducir.py \
  --fuente apps/studio/src/i18n/es.json \
  --referencia apps/studio/src/i18n/en.json \
  --salida apps/studio/src/i18n \
  --contexto "Andarama Studio, el editor en el navegador con el que se crean y publican tours virtuales 360"

# Visor (packages/viewer-ui/src/i18n/{lang}.json)
python3 tooling/i18n/traducir.py \
  --fuente packages/viewer-ui/src/i18n/es.json \
  --referencia packages/viewer-ui/src/i18n/en.json \
  --salida packages/viewer-ui/src/i18n \
  --contexto "el visor de tours virtuales 360 de Andarama (la interfaz que ve el visitante del tour)"
```

Opciones:

| Opción | Por defecto | Qué hace |
|---|---|---|
| `--idiomas ar,cs` | los 30 que no son `es`/`en` | Limita la pasada a esos códigos |
| `--lote 60` | 60 | Claves por llamada al modelo |
| `--paralelo 8` | 8 | Idiomas traduciéndose a la vez |
| `--modelo` | `z-ai/glm-5.3-flash` | Modelo de OpenRouter o atajo de `or.py` |
| `--glosario` | `tooling/i18n/glosario.json` | Glosario fijo que se incrusta en cada lote |
| `--forzar` | | Retraduce todo aunque las huellas coincidan |
| `--solo-validar` | | No traduce; solo comprueba los ficheros |

## Cómo funciona

- **Incremental.** En `{salida}/.hash` se guarda una huella por clave e idioma
  calculada sobre el texto español y el inglés. Solo se traducen las claves
  nuevas o cuyo original ha cambiado; las demás se conservan tal cual. Ese
  fichero va al repositorio: es lo que evita repetir idiomas ya hechos.
- **Reanudable.** El `{lang}.json` y el `.hash` se escriben (de forma atómica)
  tras cada lote. Si se corta, la siguiente ejecución retoma donde estaba.
- **Orden.** Cada idioma sale con exactamente las claves de `es.json`, en el
  mismo orden; las claves que desaparecen de la fuente se quitan solas.
- **Glosario.** `glosario.json` fija lo que no se traduce (Andarama, Studio,
  «¡anda!», los nombres de los planes) y los términos que deben ir siempre
  igual (tour/recorrido, escena, hotspot, publicar…).
- **Comprobaciones por cadena.** Se rechaza (y se vuelve a pedir en un lote
  más pequeño) toda traducción que pierda o cambie un marcador `{así}`, una
  etiqueta HTML o un salto de línea, que venga vacía o que sea idéntica al
  original cuando tiene cuatro palabras o más. Tras tres rondas se acepta con
  aviso antes que dejar un hueco.
- **Validación final.** Cada idioma debe tener las claves de la fuente con los
  mismos marcadores; si no, el programa sale con código 1. Además lista las
  cadenas cortas iguales al original para revisarlas a mano (muchas son
  legítimas: «Email», «OK», nombres propios).

Las pruebas `apps/studio/src/i18n.test.ts` y `packages/viewer-ui/src/i18n.test.ts`
repiten la validación en cada `pnpm test`.

## Añadir o cambiar cadenas

1. Añade o cambia la clave en `es.json` y en `en.json`.
2. Lanza la tubería para ese proyecto: solo se traducirán las claves nuevas o
   cambiadas (unos segundos por idioma).
3. Revisa el informe de cadenas dudosas y corrige a mano lo que haga falta en
   el `{lang}.json`: una corrección manual no se pisa mientras no cambie el
   original (la huella sigue siendo la misma).

## Añadir un idioma

Los códigos válidos son los de `IDIOMAS` en `traducir.py` (los mismos que
`UI_LANGS` en `packages/schema/src/langs.ts`). Para uno nuevo hay que darlo
de alta en ambos sitios, en `LANG_NAMES` (nombre en su propia lengua), en el
mapa de cargadores de `packages/viewer-ui/src/i18n.ts` y, si Clerk lo trae, en
`CLERK_LOCALES` de `apps/studio/src/clerk.tsx`.
