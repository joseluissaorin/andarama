---
title: Música y audio
description: La música de fondo de todo el recorrido, el sonido de cada escena, cómo se combinan, cómo silenciar el editor mientras trabajas y cómo quitar el sonido de una escena en el recorrido publicado.
---

Un recorrido puede sonar de dos maneras: con una **música de fondo** que
acompaña toda la visita y con el **audio propio de cada escena** (un ambiente,
una narración o fuentes de sonido ancladas a un punto del panorama). Las dos
se combinan solas, sin que tengas que programar nada.

## Música de fondo del recorrido

En **Ajustes del tour › Música de fondo**:

1. Pulsa **Elegir** en **Pista de audio** y escoge un fichero de audio de la
   biblioteca.
2. Ajusta el **Volumen** con el deslizador (por defecto, 50 %).
3. Puedes escucharla ahí mismo, cambiarla o borrarla.

La pista suena **en bucle durante todo el recorrido** y **baja sola cuando hay
una narración**, para que la voz se entienda.

:::note[El primer gesto]
Muchos navegadores no dejan sonar nada hasta que el visitante toca la pantalla
o hace clic. Por eso la música no empieza al cargar la página, sino con el
primer gesto del visitante. No es un fallo del recorrido.
:::

## El audio de cada escena

En las propiedades de la escena, la sección **Audio de la escena** admite:

- **Ambiente**: suena en bucle mientras el visitante está en la escena y se
  funde con el de la siguiente.
- **Narración**: suena una vez al entrar. Con **Bloquear navegación hasta
  terminar**, no se puede salir de la escena hasta que acaba (útil cuando la
  explicación es imprescindible).
- **Audio espacial**: fuentes ancladas a una dirección del panorama, que se oyen
  más o menos según hacia dónde se mira.

## Cómo se combinan

| En la escena hay… | La música de fondo… |
|---|---|
| Nada propio | Sigue sonando |
| Una narración | Baja mientras dura la voz y vuelve después |
| Un ambiente o audio espacial | Se funde a silencio mientras se está en la escena y vuelve al salir |

Es decir: **el audio de una escena sustituye a la música mientras se está en
ella**. Así no se mezclan una canción y el ruido de una fábrica, y el
visitante oye lo que corresponde a cada sala.

:::note[Excepciones por escena]
El formato del recorrido admite forzar este comportamiento escena a escena con
`audio.replaceGlobal`: `false` mantiene la música sonando junto al ambiente de
la escena, y `true` la calla aunque la escena no tenga sonido propio. El Studio
todavía no ofrece este ajuste en pantalla; los detalles están en el
[formato tour.json](/docs/referencia/tour-json/#cambios-recientes-del-formato).
:::

## Silenciar mientras editas

Oír el mismo ambiente cien veces mientras se colocan hotspots cansa. En la
barra del panorama del editor está el botón del altavoz; cuando la escena tiene
sonido, lleva el texto **Silenciar**, y la primera vez que suena algo el editor
te lo recuerda con un aviso.

- **Solo afecta al editor**: el recorrido publicado suena igual.
- El editor **lo recuerda** en ese navegador: si lo silencias, sigue silenciado
  la próxima vez.
- Para volver a oírlo, pulsa **Activar sonido**.

## Quitar el sonido de una escena en el recorrido publicado

Si lo que quieres es que la escena **no suene para el visitante**, no basta con
silenciar el editor. Hay dos caminos:

- **Desde la barra del panorama.** Cuando la escena tiene ambiente, narración o
  audio espacial, junto a **Silenciar** aparece una flecha. Abre un menú con
  **Que no suene en el recorrido publicado** (y, si ya está desactivado,
  **Volver a activar el sonido en el recorrido**) y con **Abrir el audio de la
  escena**, que lleva directamente a esa sección de las propiedades.
- **Desde Audio de la escena.** El interruptor **Suena en el recorrido
  publicado** hace lo mismo. Mientras está apagado, la sección lo recuerda con
  un aviso.

Desactivar **no borra nada**: el ambiente y la narración elegidos se quedan en
la escena por si los vuelves a activar, pero el recorrido publicado y los
paquetes exportados no los llevan. Si prefieres quitarlos del todo, cada pista
tiene su botón **Quitar**.

Tras cambiarlo, vuelve a publicar para que llegue al recorrido.

## El botón de silencio del visitante

El visor tiene su propio botón de silencio, que corta la música, los ambientes
y las narraciones. Se activa o desactiva en **Ajustes del tour › Componentes de
interfaz**, con la opción **Silencio**.
