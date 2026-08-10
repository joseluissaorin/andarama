# Avisos de terceros

El código de ULL360 se distribuye bajo la licencia [EUPL-1.2](LICENSE). Este fichero recoge los materiales de terceros incluidos en el repositorio y sus condiciones propias.

## Marca de la Universidad de La Laguna

Los ficheros de `packages/ui/brand/*.svg` y `apps/studio/src/brand/*.svg` (marca y símbolo de la Universidad de La Laguna) proceden de los recursos oficiales del [manual de identidad corporativa de la ULL](https://www.ull.es/portal/marca/) y se incluyen sin alteración para el despliegue institucional de esta plataforma. **Son signos distintivos de la Universidad de La Laguna y NO quedan cubiertos por la EUPL-1.2**: cualquier otro uso debe respetar el manual de identidad y la normativa de la ULL. Si despliegas ULL360 para otra organización, sustituye estos ficheros por tu propia marca.

## Tipografía Argentum Sans

Los ficheros `packages/ui/brand/fonts/ArgentumSans-*.woff2` y `apps/studio/public/fonts/ArgentumSans-*.woff2` corresponden a la tipografía corporativa oficial de la ULL, distribuida por la Universidad bajo la **SIL Open Font License 1.1** (véase [packages/ui/brand/fonts/OFL.txt](packages/ui/brand/fonts/OFL.txt)).

## Dependencias destacadas

| Componente | Licencia | Uso |
|---|---|---|
| [Marzipano](https://www.marzipano.net/) | Apache-2.0 | Base del render multirresolución del visor |
| [lucide](https://lucide.dev/) | ISC | Iconografía SVG (nunca emojis) |
| [three.js](https://threejs.org/) | MIT | Modelos OBJ/STL (carga perezosa) |
| [PDF.js](https://mozilla.github.io/pdf.js/) | Apache-2.0 | Visor de documentos |
| [`@google/model-viewer`](https://modelviewer.dev/) | Apache-2.0 | Modelos GLB/glTF/USDZ y AR |
| [hls.js](https://github.com/video-dev/hls.js) | Apache-2.0 | Vídeo 360 en streaming |
| Hono, Drizzle, React, Vite, Starlight… | MIT | Backend, Studio y documentación |

Las licencias completas de las dependencias se distribuyen con sus paquetes npm.

## Medios de demostración

Las fotografías esféricas del tour de demostración «Recorrido real 360» proceden de Wikimedia Commons bajo licencias **CC BY-SA**; las atribuciones completas (autor y licencia por imagen) se muestran dentro del propio tour y se conservan en los metadatos del seed (`scripts/seed-demo.mjs`). Los panoramas sintéticos de `examples/` se publican bajo CC BY 4.0 (véase [AUTHORS](AUTHORS)).
