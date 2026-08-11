# Contribuir a Andarama

Gracias por asomarte. Andarama es código abierto (EUPL-1.2) y se agradece cualquier tamaño de ayuda: una errata en la documentación, una traducción, un informe de error bien contado o un tipo de hotspot nuevo.

Todo lo que pasa aquí se rige por el [código de conducta](CODE_OF_CONDUCT.md). En una frase: sé riguroso con el código y amable con las personas.

## Por dónde empezar

- Los issues con la etiqueta **`good first issue`** son puertas de entrada pequeñas y bien delimitadas.
- Si algo no funciona, abre un [informe de error](https://github.com/joseluissaorin/andarama/issues/new?template=error.yml). Cuenta qué esperabas, qué pasó y cómo reproducirlo; una captura o un `tour.json` de ejemplo valen su peso en oro.
- Si traes una idea grande, ábrela como [propuesta](https://github.com/joseluissaorin/andarama/issues/new?template=propuesta.yml) antes de escribir código. Es más rápido acordar el camino que rehacerlo.
- Para vulnerabilidades, **no abras un issue**: sigue [SECURITY.md](SECURITY.md).

## Preparar el entorno

Requisitos: **Node.js 20 o superior** y **pnpm 10**. Docker solo si quieres probar el self-host.

```bash
git clone https://github.com/joseluissaorin/andarama && cd andarama
pnpm install
pnpm build:packages

pnpm dev            # API en http://localhost:8787 (wrangler dev)
pnpm dev:studio     # Studio en http://localhost:5173/studio/
```

La variante self-host, que no necesita cuenta de Cloudflare y guarda los datos en SQLite y en el disco, se levanta con `pnpm dev:node` (puerto 8788).

Para tener contenido con el que jugar:

```bash
node scripts/seed-demo.mjs http://localhost:8788 tu@correo contraseña ./examples/panoramas
```

## El bucle de trabajo

1. Rama desde `main`, con prefijo: `feat/...`, `fix/...`, `docs/...`, `refactor/...`.
2. Escribe la prueba junto al cambio. Lo puro se prueba con Vitest al lado del fichero (`*.test.ts`); los caminos críticos, con Playwright en `tooling/e2e/`.
3. Antes de abrir el PR, esto tiene que estar en verde:

   ```bash
   pnpm lint && pnpm typecheck && pnpm test
   pnpm --filter @andarama/studio build && pnpm test:e2e
   ```

   Ojo con el orden: las pruebas E2E sirven el Studio ya compilado desde `apps/studio/dist-root`, así que hay que reconstruirlo antes o estarás probando la versión anterior.
4. Abre el PR con la plantilla rellena. La CI ejecuta la batería completa, construye la imagen Docker y, si el PR viene del propio repositorio, sube una versión de previsualización.

Si tocas algo que se ve, **míralo en un navegador de verdad** antes de mandarlo. Media docena de defectos de este proyecto (teselas en negro, suelo y techo intercambiados, una barra negra fantasma sobre las miniaturas) pasaron todas las pruebas y solo cayeron al mirar la pantalla.

## Las reglas de la casa

- **Ningún módulo de dominio importa APIs de Cloudflare.** Todo pasa por `packages/adapters`, que es lo que permite que el self-host sea la misma aplicación y no un puerto.
- **`tour.json` es el contrato central.** Cualquier cambio de forma exige subir la versión del esquema y escribir su migrador en `packages/schema`; lo que alguien exportó hace años tiene que seguir abriéndose.
- **El visor no depende de ningún framework de interfaz.** `packages/viewer` es TypeScript y WebGL; la piel (`packages/viewer-ui`) son Web Components.
- **Sin emojis en la interfaz.** Iconografía SVG (lucide en el Studio, el juego propio en el visor).
- **Español con tildes y eñes** en todo lo que lee una persona: interfaz, diccionarios, documentación, mensajes de error, correos. Los identificadores, claves JSON y rutas se quedan como están. Cuidado con los plurales en `-ciones`, que no llevan tilde.
- **La raya (—) no es un guion ni lleva espacios a ambos lados.** Los incisos van con dos rayas pegadas al inciso: `el centro —que ya trabaja con esto— no cambia de sistema`.
- Comentarios que expliquen **por qué**, no qué. El código ya dice qué hace.

## Traducciones

Las cadenas viven en dos sitios:

- Studio: `apps/studio/src/i18n/*.json`
- Visor: `packages/viewer-ui/src/i18n/*.json`

Para añadir un idioma, copia `es.json`, tradúcelo entero y regístralo en el índice del módulo correspondiente. Si una clave falta, la interfaz cae al idioma por defecto en vez de romperse, pero un idioma a medias se nota: mejor completo.

## Documentación

La documentación vive en `apps/docs` (Astro Starlight) y se publica en [docs.andarama.com](https://docs.andarama.com). Si tu cambio altera lo que ve o hace una persona, la documentación va en el mismo PR.

## Marca

Las imágenes del repositorio (portada y tarjeta social) no se guardan a mano: se generan con `node tooling/marca/generar.mjs` a partir de las plantillas de `tooling/marca/`. Si cambias el logotipo o el eslogan, vuelve a generarlas. Las capturas se rehacen con `tooling/marca/capturas.mjs` contra cualquier instancia.

## Licencia de lo que aportes

Al abrir un PR aceptas que tu contribución se publique bajo la **EUPL-1.2**, la misma licencia del proyecto. No hace falta firmar ningún acuerdo aparte.
