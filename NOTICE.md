# Avisos de terceros

El código de Andarama se distribuye bajo la licencia [EUPL-1.2](LICENSE). Este fichero recoge los materiales de terceros incluidos en el repositorio y sus condiciones propias.

## Origen del proyecto

Andarama nació como **ULL360**, un proyecto desarrollado para la Universidad de
La Laguna. La marca y la tipografía institucionales de la ULL que acompañaban a
aquella versión se han retirado del repositorio; la identidad actual (la
criatura, el logotipo y la paleta de Andarama) es propia del proyecto y se
distribuye con él.

## Tipografías

Los ficheros `*/fonts/Baloo2-Variable.woff2` y `*/fonts/SpaceMono-*.woff2`
corresponden a las tipografías **Baloo 2** (Ek Type) y **Space Mono** (Colophon
Foundry), ambas bajo la **SIL Open Font License 1.1** (véase
[packages/ui/brand/fonts/OFL.txt](packages/ui/brand/fonts/OFL.txt)).

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
