---
title: "Equirectangular a cubemap: qué es y cuándo hace falta"
description: "Un cubemap guarda un panorama 360 en seis caras cuadradas. Cuándo convertir de equirectangular a cubemap (motores 3D, skybox) y cómo hacerlo gratis."
lang: es
slug: que-es-un-cubemap
cluster: herramientas
fecha: 2026-09-20
autor: jose-luis-saorin
faq:
  - q: "¿Qué tamaño de cara debo elegir al convertir?"
    a: "El ancho del equirectangular dividido entre cuatro. Un panorama de 8192 px de ancho da caras de 2048; uno de 4096, caras de 1024. Un tamaño mayor solo añade peso, no detalle."
  - q: "¿Qué nombres llevan las seis caras?"
    a: "Depende del programa. Marzipano y krpano usan f, b, l, r, u, d (frente, atrás, izquierda, derecha, arriba, abajo); Unity y Three.js usan px, nx, py, ny, pz, nz. El conversor de Andarama ofrece los dos convenios."
  - q: "¿Se puede volver de cubemap a equirectangular?"
    a: "Sí. La misma herramienta cose seis caras en un panorama 2:1, útil para recuperar un skybox, un render de Blender en formato cubo o una foto de una cámara que exporta en caras."
  - q: "¿Sirve para vídeo 360?"
    a: "No, solo para imágenes. Para convertir vídeo entre proyecciones hace falta un programa de escritorio como FFmpeg con el filtro v360."
---

Un **cubemap** es una forma de guardar un panorama de 360 grados en **seis imágenes cuadradas**, una por cada cara de un cubo imaginario que rodea la cámara: frente, atrás, izquierda, derecha, arriba y abajo. Es el formato que esperan los motores 3D, los skybox de los videojuegos, los mapas de reflexión y muchos visores 360, mientras que las cámaras entregan sus fotos en proyección equirectangular. Convertir de una a otra es un cálculo geométrico sencillo que el [conversor equirectangular a cubemap de Andarama](/herramientas/equirectangular-a-cubemap/) hace en el navegador, sin subir nada, en los dos sentidos.

## Dos maneras de aplanar la misma esfera

Tanto el equirectangular como el cubemap contienen exactamente la misma información: todo lo que se ve alrededor de un punto. Cambia la manera de repartirla en píxeles.

- La **equirectangular** desdobla la esfera en un solo rectángulo 2:1. Es cómoda para guardar, editar y compartir, pero deforma mucho los polos: la fila de píxeles del cénit, que en la realidad es un punto, ocupa el ancho entero. Tenemos un artículo sobre [qué es una foto equirectangular](/blog/foto-equirectangular/).
- El **cubemap** proyecta la esfera sobre seis planos. Cada cara es una foto normal de 90 grados de campo, con perspectiva rectilínea, sin estiramientos en los polos. A cambio, hay seis ficheros en lugar de uno, y las costuras entre caras hay que tratarlas bien.

Para un motor gráfico, la segunda opción es mucho mejor: cada cara es una textura corriente que la tarjeta gráfica muestrea de forma directa, sin corregir deformaciones. Por eso los cubemaps son la norma en 3D en tiempo real.

## Cuándo hace falta convertir a cubemap

| Caso | Por qué el cubemap |
|---|---|
| Skybox en Unity, Unreal o Godot | Los motores lo piden como seis texturas o como cubemap nativo |
| Entornos en Three.js o Babylon.js | `CubeTextureLoader` y equivalentes cargan las seis caras |
| Mapas de reflexión y de iluminación (HDRI) | La muestra por dirección es directa y sin distorsión |
| Visores 360 con teselado (Marzipano, krpano) | Trocean cada cara en niveles de zoom; las teselas cuadradas son más eficientes |
| Recortar una vista de 90 grados sin distorsión | Una cara es una foto rectilínea normal, lista para usar |

El último caso se olvida a menudo y es muy práctico: si necesitas una «foto normal» de lo que había justo enfrente de la cámara 360, la cara frontal del cubemap es exactamente eso.

## Cuándo no hace falta

- **Para ver la foto** en un visor web, en redes o en el móvil. Todos esperan la equirectangular con sus metadatos.
- **Para editarla** en un programa de retoque: el rectángulo 2:1 es más cómodo que seis cuadrados con costuras.
- **Para subirla a un editor de recorridos**. Andarama, por ejemplo, recibe la equirectangular y genera él mismo, en el navegador, la pirámide de teselas cúbicas que usa el visor (equirectangular a caras de cubo a niveles de zoom a teselas WebP de 512 px). No hay que convertir nada a mano; lo cuenta la [documentación de medios](https://docs.andarama.com/usuario/medios/).

## Cómo convertir un equirectangular a cubemap online

1. Abre el [conversor](/herramientas/equirectangular-a-cubemap/) y elige el panorama (JPG o PNG de proporción 2:1).
2. Escoge el **tamaño de cara**. La regla es el ancho del panorama entre cuatro: 8192 de ancho, caras de 2048; 4096, caras de 1024. Un tamaño mayor no añade detalle, solo peso.
3. Elige el **convenio de nombres**: `f, b, l, r, u, d` (Marzipano y krpano) o `px, nx, py, ny, pz, nz` (Unity, Three.js).
4. Descarga las seis caras por separado o en un ZIP.

Todo se calcula en Canvas dentro de tu navegador: para cada píxel de cada cara se traza la dirección desde el centro del cubo, se pasa a longitud y latitud y se lee el punto correspondiente del equirectangular. Es la misma geometría que usa el troceador de Andarama para preparar los recorridos. Ninguna imagen sale de tu equipo.

## Y de cubemap a equirectangular

El camino inverso también está en la misma página: se eligen las seis caras, se indica el orden y la herramienta las cose en un único panorama 2:1 listo para cualquier visor, para redes o para subirlo a un recorrido. Los casos típicos:

- Un **skybox** de un videojuego o de una biblioteca de recursos que quieres ver como panorama.
- Un **render de Blender** o de otro programa 3D exportado en formato cubo.
- Una **cámara** o un programa de cosido que entrega en caras (algunas cámaras profesionales lo hacen).

## Los convenios de ejes, que dan más disgustos de los que parece

Aquí está la trampa habitual: no todos los programas llaman igual a las caras ni las orientan igual. Marzipano y krpano usan frente, atrás, izquierda, derecha, arriba y abajo; Unity y Three.js usan los ejes con signo (+X, −X, +Y, −Y, +Z, −Z), y algunos motores esperan la cara superior girada 90 o 180 grados respecto a otros. Si el cielo aparece de lado o el suelo con las costuras cruzadas, no es que la conversión esté mal: es que el destino usa otro convenio. El conversor de Andarama ofrece los dos convenios más extendidos; para el resto suele bastar con girar la cara de arriba y la de abajo.

## Resolución y peso

Seis caras de 2048 px pesan, en PNG, bastante más que la equirectangular de 8192 × 4096 de la que salen, porque el PNG no comprime con pérdida. Para un skybox de producción conviene pasar las caras a JPG o WebP después, o usar directamente el tamaño de cara que el motor va a mostrar: para una escena que se ve en un móvil, caras de 1024 son suficientes.

Para vídeo 360 la conversión entre proyecciones no se puede hacer en el navegador con esta herramienta; hay que recurrir a FFmpeg y su filtro `v360`, que convierte entre equirectangular, cubemap y otras proyecciones fotograma a fotograma.

## Si lo que quieres es un recorrido

Convertir a cubemap tiene sentido cuando vas a programar algo en 3D. Si lo que quieres es enlazar varias fotos 360 en un recorrido que se abre con un enlace, con flechas entre salas, textos y preguntas, la conversión sobra: subes las equirectangulares a Andarama y el troceado cúbico se hace solo. El [tutorial del primer tour](https://docs.andarama.com/tutoriales/primer-tour/) muestra el proceso completo en un cuarto de hora, y el programa es de código abierto, así que también puedes [instalártelo](https://docs.andarama.com/despliegue/escritorio/).
