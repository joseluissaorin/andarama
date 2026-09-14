---
title: "Qué es una foto equirectangular (y cómo verla bien)"
description: "Una foto equirectangular es una esfera de 360 grados desplegada en un rectángulo 2:1. Qué es, cómo reconocerla y cómo verla sin instalar nada."
lang: es
slug: foto-equirectangular
cluster: conceptos
fecha: 2026-09-14
autor: jose-luis-saorin
faq:
  - q: "¿Toda foto 360 es equirectangular?"
    a: "Casi todas las que salen de una cámara 360 de consumo, sí. Las excepciones son los cubemaps (seis caras cuadradas), las fotos de ojo de pez sin coser y los panoramas cilíndricos del modo Pano del móvil, que no llegan a cubrir la esfera."
  - q: "¿Cómo sé si mi imagen es equirectangular?"
    a: "Mira las dimensiones: el ancho tiene que ser exactamente el doble que el alto (por ejemplo 8192 × 4096). Si además el cielo y el suelo se ven estirados y las líneas rectas se curvan, es equirectangular. Muchas cámaras añaden también metadatos XMP GPano al fichero."
  - q: "¿Puedo abrirla con el visor de fotos del ordenador?"
    a: "Sí, pero la verás plana y deformada. Para mirarla como si estuvieras dentro necesitas un visor 360, como el visor gratuito de Andarama, que funciona en el navegador sin subir la foto a ningún sitio."
  - q: "¿Qué resolución debería tener?"
    a: "Para verla en pantalla, 4096 × 2048 ya se ve bien. Para un recorrido virtual o para gafas, lo habitual es 8192 × 4096 (8K); las cámaras actuales de gama media ya lo dan."
---

Una **foto equirectangular** es una imagen de 360 grados desplegada sobre un rectángulo cuyo ancho es exactamente el doble que su alto. Es el formato en el que guardan sus fotos casi todas las cámaras 360 (Insta360, Ricoh Theta, GoPro Max, Kandao) y el que esperan los visores, las redes sociales y los programas de recorridos virtuales. Vista en un visor de fotos normal parece un mapa del mundo estirado; vista en un visor 360 te coloca en el centro de la escena y te deja mirar alrededor.

## Qué significa «equirectangular»

El nombre viene de la cartografía. Para dibujar la Tierra en un papel hay que decidir cómo aplanar una esfera, y la proyección equirectangular es la más simple de todas: cada grado de longitud ocupa el mismo ancho, cada grado de latitud ocupa el mismo alto. De ahí lo de «equi-rectangular»: una rejilla de rectángulos iguales.

Aplicado a una foto 360, la regla es la misma:

- Los **360 grados de giro** (mirar a la derecha y a la izquierda hasta dar la vuelta completa) se reparten a lo ancho.
- Los **180 grados de arriba abajo** (del cénit, justo encima de la cámara, al nadir, justo debajo) se reparten a lo alto.

Por eso la proporción es siempre **2:1**: 360 es el doble de 180. Una foto de 5760 × 2880, de 8192 × 4096 o de 11 968 × 5984 es equirectangular; una de 4000 × 3000 no puede serlo.

## Por qué se ve rara en un visor normal

En el centro de la imagen, a la altura del horizonte, la foto se ve casi normal. Pero conforme subimos hacia el cielo o bajamos hacia el suelo, cada fila de píxeles representa un círculo cada vez más pequeño de la esfera real, estirado al mismo ancho que el ecuador. El resultado es conocido:

- El **cielo y el suelo** aparecen estirados en horizontal hasta ocupar toda la fila superior e inferior. Un punto del cénit se convierte en una línea de borde a borde.
- Las **líneas rectas** (el borde de una mesa, una cornisa, una carretera) se curvan en forma de onda.
- El **trípode** o la mano del fotógrafo aparecen deformados en la parte inferior, porque el nadir es justo el punto que la cámara no ve bien.

Nada de esto es un defecto de la foto. Es la geometría de aplanar una esfera, y desaparece en cuanto un visor vuelve a envolver la imagen sobre una esfera virtual y te coloca en el centro.

## Cómo reconocer una foto equirectangular

Tres comprobaciones rápidas:

1. **Las dimensiones.** Ancho igual al doble del alto. Es la prueba definitiva.
2. **Los metadatos.** Las cámaras y muchas aplicaciones escriben etiquetas XMP del esquema GPano (`ProjectionType = equirectangular`, `FullPanoWidthPixels`, etc.). Es lo que permite que Facebook o Google Fotos las reconozcan solas. Andarama también las lee: al subir una imagen detecta que es un panorama por esos metadatos o, si faltan, por la proporción 2:1 (está descrito en la [documentación de medios](https://docs.andarama.com/usuario/medios/)).
3. **El aspecto.** Cielo y suelo estirados, líneas curvas y un salto de continuidad exacto en los bordes izquierdo y derecho (son el mismo punto de la esfera).

## Formatos que no son equirectangulares (y con qué se confunden)

| Formato | Qué es | Cómo se distingue |
|---|---|---|
| Panorama cilíndrico | El modo «Pano» del iPhone o Android: un barrido horizontal | Muy ancho y poco alto (proporción 4:1 o más); no cubre el cielo ni el suelo |
| Ojo de pez doble | Lo que graban las dos lentes de una cámara 360 antes de coser | Dos círculos lado a lado sobre fondo negro |
| Cubemap | Seis caras cuadradas de un cubo | Seis ficheros, o una cruz o tira de cuadrados |
| Estereográfica (little planet) | Una proyección artística desde el cénit | Un disco con el suelo en el centro |

Todos se pueden convertir entre sí. Del equirectangular al cubemap y viceversa tienes el [conversor gratuito de Andarama](/herramientas/equirectangular-a-cubemap/), y del equirectangular al pequeño planeta, la [herramienta de little planet](/herramientas/pequeno-planeta/).

## Cómo ver una foto equirectangular sin instalar nada

La manera más rápida es el [visor 360 online de Andarama](/herramientas/visor-360-online/): eliges el fichero JPG o PNG, aparece envuelto en la esfera y puedes arrastrar para girar, usar la rueda para acercar, pasar a pantalla completa y, si el navegador tiene WebXR, ponerte unas gafas. La foto no se sube a ningún servidor; el motor WebGL la dibuja en tu propia tarjeta gráfica.

Otras opciones, cada una con su matiz:

- **El móvil**: Google Fotos y la galería de muchos Android reconocen los metadatos GPano y ofrecen la vista 360 con giroscopio. Si los metadatos faltan, la foto se ve plana.
- **Facebook**: al subir una foto equirectangular con metadatos, la publica como foto 360 navegable.
- **Programas de escritorio**: los visores de las propias cámaras (Insta360 Studio, Ricoh Theta) la abren en 360, pero hay que instalarlos.
- **Un recorrido virtual**: si quieres varias fotos enlazadas, con flechas para pasar de una sala a otra y explicaciones ancladas, ya no hablamos de un visor sino de un editor de tours, y para eso está el resto de Andarama.

Tenemos una guía más detallada sobre [cómo ver fotos 360 en el ordenador](/blog/ver-fotos-360-en-el-ordenador/).

## Qué resolución conviene

Una equirectangular reparte sus píxeles por toda la esfera, así que la nitidez aparente es mucho menor que la de una foto normal con el mismo número de megapíxeles. Orientación práctica:

- **4096 × 2048** (8 MP): suficiente para verla en un móvil o compartirla en redes.
- **5760 × 2880** (16 MP): la salida típica de las cámaras de consumo de hace unos años; correcta en pantalla.
- **8192 × 4096** (32 MP, «8K»): lo que dan las Insta360 X4 y X5 o la Ricoh Theta Z1 tras el cosido. Es el mínimo cómodo para gafas de realidad virtual y para recorridos donde el visitante hace zoom.
- **Más de 8K**: se consigue con fotos por lentes cosidas a mano o con cámaras profesionales. Para servirlas en web hay que trocearlas en teselas; Andarama lo hace en el navegador al subirlas, con pirámides de hasta 32K.

## El nadir: el detalle que delata una foto descuidada

Justo debajo de la cámara está el trípode, el monópode o la mano de quien dispara. En una foto equirectangular ese punto es toda la fila inferior, y en un visor 360 se convierte en un círculo bajo los pies del visitante. Las opciones son taparlo con un logotipo (el «parche de nadir»), retocarlo con un programa de edición o usar un monópode fino que la cámara ya elimina en el cosido. Andarama incluye un parche de nadir con logo entre sus utilidades de imagen, junto con el nivelado del horizonte y el giro del punto cero, y todo se aplica sin destruir el original.

## Del formato al recorrido

Entender el equirectangular es útil sobre todo para lo que viene después: elegir una cámara, decidir la resolución, preparar las fotos y, si hace falta, convertirlas. A partir de ahí, un visor te enseña una foto; un editor de recorridos te deja enlazar veinte, ponerles texto, audio o preguntas y publicarlas con un enlace o dentro de tu web. Si ese es tu caso, el [tutorial del primer tour](https://docs.andarama.com/tutoriales/primer-tour/) tarda un cuarto de hora, y la cuenta de prueba no pide tarjeta.
