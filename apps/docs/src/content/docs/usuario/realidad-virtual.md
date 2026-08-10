---
title: Realidad virtual (WebXR)
description: Ver los tours de ULL360 con gafas Meta Quest, Pico, Vive o Vision Pro, con las manos como mando.
---

Cualquier tour de ULL360 se ve en gafas de realidad virtual sin instalar nada: se
abre la dirección del tour en el navegador de las gafas y se pulsa el botón
**Modo VR**. No hace falta una aplicación, ni una tienda, ni una versión distinta
del tour. Es el mismo `tour.json` que ya está publicado.

## Qué se necesita

| Requisito | Detalle |
| --- | --- |
| Gafas con WebXR | Meta Quest 2, 3, 3S y Pro (navegador Meta Quest), Pico 4, HTC Vive (Wolvic/Firefox Reality), Vision Pro (Safari), cualquier equipo con SteamVR y Chrome o Edge |
| HTTPS | WebXR **solo** funciona en contextos seguros: `https://` o `localhost`. Un tour servido por `http://` o abierto con `file://` cae en modo cardboard |
| Gesto del usuario | La sesión inmersiva la tiene que iniciar una pulsación: el botón **Modo VR** del visor |
| Permisos en iframe | Si el tour va embebido, el iframe necesita `allow="xr-spatial-tracking"` |

Si el navegador no expone WebXR (móviles Android e iOS corrientes), el mismo
botón entra en **modo cardboard**: pantalla partida en dos, seguimiento por
giroscopio y selección por mirada. Sirve para visores de cartón y para gafas de
móvil sin WebXR.

## Las manos

ULL360 usa el módulo de seguimiento de manos de WebXR. Cuando las gafas lo
tienen activado, las dos manos aparecen dentro del tour dibujadas con sus **25
articulaciones** (la misma jerarquía que define la especificación: muñeca y cinco
dedos con metacarpo, falanges y yema). No hay que configurar nada: si el visor
publica las manos, se ven; si no, se ven los mandos.

- **Apuntar**: de cada mano sale un rayo fino. Al cruzarse con un hotspot el rayo
  se acorta hasta él, se tiñe de violeta ULL y el hotspot crece un poco.
- **Pinza**: juntar el pulgar y el índice acciona lo que esté apuntado. El umbral
  tiene histéresis (cierra por debajo de 22 mm y no vuelve a abrirse hasta los
  32 mm), así que no hay parpadeos ni activaciones dobles.
- **Tocar**: con un panel abierto se puede pulsar directamente con la yema del
  índice, sin rayo, acercando el dedo a menos de 45 mm de la superficie.
- La pinza de la mano izquierda contra la palma está reservada por el sistema
  para el menú de las gafas: ULL360 no la usa.

Las articulaciones se leen con `XRFrame.fillPoses` y `fillJointRadii`, que
resuelven las 25 poses de una mano en una sola llamada; si el navegador no las
implementa se recurre a `getJointPose` articulación a articulación.

## Los mandos

Con mandos (Touch, Pico, Index) el comportamiento es el mismo: rayo de apuntado
desde el mando, gatillo o botón de selección para accionar. Se dibuja además una
esfera en la posición de la empuñadura para dar referencia espacial. Manos y
mandos conviven: se pueden soltar los mandos a media visita y seguir con las
manos, o al revés.

## Qué se puede hacer dentro de las gafas

Todos los hotspots del tour aparecen en VR, no solo los de navegación. Cada uno
se dibuja como un pictograma flotante con su etiqueta, a seis metros del
visitante, y se comporta así:

| Hotspot | En VR |
| --- | --- |
| Navegación | Salta a la escena destino con un fundido; el panorama se recarga sin salir de la sesión |
| Texto, tooltip | Panel inmersivo con el texto formateado y desplazamiento con las flechas del panel |
| Imagen | Panel con la imagen ajustada, pie de foto incluido |
| Galería | Panel con anterior/siguiente y contador |
| Vídeo (fichero) | Reproducción en el panel con barra de progreso y botón de pausa |
| Audio | Panel con transporte y transcripción, si la hay |
| Quiz | Opciones pulsables, comprobación y respuesta razonada; la puntuación cuenta igual que fuera de VR |
| Comparador | Divisor arrastrable con la pinza |
| Enlace, estado, polígono | Ejecutan su acción directamente (cambio de variable, activación de la zona) |
| PDF, web, formulario, vídeo embebido, modelo 3D | Muestran una tarjeta con el título y la dirección, y un botón **Abrir al salir de VR**: al terminar la sesión el visor abre ese contenido en una pestaña |

Los cuatro últimos no se meten dentro de las gafas a propósito: un PDF, un
formulario con Turnstile o un `iframe` de YouTube no se pueden componer dentro
de una sesión inmersiva sin degradar la experiencia y sin romper el aislamiento
del navegador. En vez de fingir que funcionan, el visor los aparca y los abre al
salir.

Los paneles se dibujan con Canvas 2D y se suben como textura: no hay DOM dentro
de la sesión ni dependencias externas, por lo que funcionan exactamente igual en
un tour publicado y en un paquete `.zip` exportado.

## En los paquetes exportados

La realidad virtual viaja dentro del `.zip`. El paquete estándar lleva el mismo
motor que el tour publicado, así que el botón **Modo VR** aparece y funciona con
una condición: **hay que servirlo por HTTPS**. Abrir el `index.html` con doble
clic (`file://`) permite ver el tour, pero no entrar en modo inmersivo — el
navegador lo prohíbe. En ese caso el visor entra en modo cardboard.

El fichero `LEEME.md` que acompaña a cada paquete lo recuerda, y el `.htaccess`
incluido añade los tipos MIME y las cabeceras de caché que necesita un
alojamiento compartido corriente.

## Al embeber un tour

El código que genera el Studio ya incluye los permisos necesarios:

```html
<iframe
  src="https://tours.ull.es/t/mi-tour"
  style="width:100%;aspect-ratio:16/9;border:0"
  allow="fullscreen; gyroscope; accelerometer; xr-spatial-tracking"
  allowfullscreen
  title="Mi tour"
></iframe>
```

Sin `xr-spatial-tracking` el botón de VR aparece pero la sesión no arranca: el
documento incrustado no tiene permiso para pedirla.

## Rendimiento

Dentro de la sesión el panorama se resuelve como una esfera equirectangular de
una sola textura (2048 px de lado en tours multirresolución), no como mosaico de
tiles: en gafas es preferible una textura estable a la carga progresiva, que en
estéreo se nota mucho más. Los tours con vídeo 360 suben el fotograma a la
textura en cada pasada.

Recomendaciones para un tour cómodo en gafas:

- Menos de 25 hotspots por escena; con más, la escena se lee mal a seis metros.
- Etiquetas cortas: el pictograma reserva el ancho de la etiqueta, y un título
  largo se convierte en un cartel enorme.
- Vídeo 360 a 4096 × 2048 como máximo si el tour se va a ver en Quest 2.

## Accesibilidad

- El modo VR nunca es obligatorio: todo el contenido está disponible en el visor
  plano y en la **versión accesible** en texto.
- No hay desplazamiento libre por la escena, solo teletransporte entre escenas:
  es la forma de navegación que menos mareo provoca.
- La selección por pinza no exige mantener la postura: se acciona al cerrar, no
  al sostener.
- El modo cardboard usa selección por mirada con 1,5 s de permanencia, sin
  necesidad de mando ni botones.

## Problemas frecuentes

**El botón de VR no hace nada.** Comprueba que la dirección empieza por
`https://`. En un tour exportado abierto con doble clic no puede funcionar:
súbelo a un alojamiento.

**Entra en pantalla partida en lugar de en las gafas.** El navegador no tiene
WebXR o la sesión fue rechazada: es el modo cardboard de respaldo.

**Se ven los mandos pero no las manos.** El seguimiento de manos está desactivado
en los ajustes de las gafas. ULL360 pide `hand-tracking` como característica
opcional para que la sesión arranque igualmente.

**Dentro de un iframe no entra en VR.** Falta `allow="xr-spatial-tracking"`.

**El rayo no llega a un hotspot.** Los hotspots se colocan por yaw y pitch a
distancia fija; si dos quedan muy juntos, sepáralos en el editor.
