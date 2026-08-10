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
una condición: **hay que servirlo por HTTPS**.

El paquete estándar necesita un servidor, cualquiera: no funciona abriendo el
`index.html` con doble clic, porque el navegador bloquea los módulos y los
panoramas cargados desde `file://`. Para una prueba local basta
`python3 -m http.server` en la carpeta; para VR de verdad hace falta HTTPS. La
variante **HTML único** sí se abre con doble clic, pero entonces WebXR no está
disponible (`file://` no es un contexto seguro) y el visor entra en modo
cardboard.

El fichero `LEEME.md` que acompaña a cada paquete lo recuerda, y el `.htaccess`
incluido añade los tipos MIME y las cabeceras de caché que necesita un
alojamiento compartido corriente.

## Modo cartón, en detalle

Unas gafas de cartón se sujetan **en horizontal**: si el móvil está vertical
aparece un aviso pidiendo que se gire, y el visor intenta bloquear la
orientación donde el navegador lo permite (Safari no lo permite).

- La orientación se calcula con el cuaternión del dispositivo y se compensa el
  ángulo de la pantalla, así que la escena mantiene el horizonte a nivel al
  girar el teléfono y respeta la inclinación de la cabeza. Antes se traducían
  los ángulos a mano y la imagen aparecía volcada.
- El **botón físico** de las gafas de cartón toca la pantalla: al tocar, se
  acciona al instante lo que esté enfocado, sin esperar la permanencia.
- En iOS hay que aceptar el permiso de movimiento y orientación; sin él el
  seguimiento no llega y la escena se queda quieta.

## Cerrar un panel

Todo panel abierto lleva su aspa arriba a la derecha, y se alcanza con
cualquiera de las tres formas de apuntar:

- **Manos**: apuntar con el rayo y hacer la pinza, o tocar el aspa con la yema
  del índice.
- **Mandos**: apuntar y apretar el gatillo.
- **Sin mando ni manos** (cardboard o giroscopio): mirar el aspa y sostener la
  vista hasta que el anillo se complete.

El panel se ancla siempre delante de donde mira la cabeza al abrirlo, de modo
que el aspa queda a unos veinte grados a la derecha: un giro corto, no un
contorsionismo.

## Qué se puede accionar dentro: se decide por tour

En **Ajustes del tour › Gafas y modo cartón**:

- **Hotspots disponibles en VR**: todos, solo la navegación, o elegirlos uno a
  uno. En el modo detallado se activan y desactivan por familias (Contenido,
  Audiovisual, Didácticos) o tipo a tipo. La navegación nunca se puede apagar:
  sin ella el tour sería una fotografía fija.
- **Permanencia de la mirada**: los segundos que hay que sostener la vista sobre
  un marcador para que se accione solo. Por defecto 2,5 s.

Un recorrido de puertas abiertas puede querer que en gafas solo se camine y que
el contenido se lea después en pantalla; una práctica de laboratorio querrá justo
lo contrario. Es la misma escena, distinta configuración.

## Sin mando: el retículo de mirada

Con el giroscopio del móvil o en modo cartón no se puede pulsar nada: la
pantalla se mira, no se toca. En cuanto se activa cualquiera de los dos aparece
un **punto en el centro** con un **anillo que se va dibujando** mientras se
sostiene la mirada sobre un marcador; al completarse, el marcador se acciona.

En el visor plano el retículo tiene dos comportamientos, y el segundo es el que
lo hace usable de verdad:

- **Mirando el panorama**, el retículo está en el centro: girar el móvil mueve
  la escena, así que centrar un marcador es apuntarlo.
- **Con un panel abierto**, el panel es un cuadro fijo en la pantalla y un
  retículo también fijo nunca alcanzaría su aspa. Entonces el retículo pasa a
  ser un **cursor que la cabeza arrastra** por la pantalla: unos diez grados a
  la derecha y quince hacia arriba bastan para llegar al botón de cerrar.

Sostener la mirada sobre algo ya accionado no lo repite: hay que apartar la
vista y volver. Y el anillo se reinicia si se cambia de objetivo o si la cabeza
se mueve más de unos seis grados, de modo que un pulso de la mano no lo
estropea.

Funciona con los diecisiete tipos de hotspot, no solo con la navegación, y la
duración es la «permanencia de la mirada» de los ajustes del tour.

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
- La selección por mirada no exige pulsar nada: ni mando, ni botones, ni tocar
  la pantalla. La permanencia es configurable por tour.

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

## Permiso de movimiento en iPhone y iPad

Safari solo deja leer el giroscopio si la página va por **HTTPS** y si el
permiso se pide dentro de una pulsación tuya, así que se pregunta al pulsar
**Modo VR**. Si dices que no —o si el aviso no llega a aparecer—, el modo cartón
enseña un botón **Permitir el movimiento** para volver a pedirlo. Si aun así no
sale, actívalo en **Ajustes › Safari › Movimiento y orientación** y vuelve a
entrar.
