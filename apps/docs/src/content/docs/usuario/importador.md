---
title: Importar de una cámara 360
description: Volcar un lote de fotos de la cámara, ordenarlas, colocarlas en el plano y crear las escenas de golpe.
---

El proceso más lento de un tour real es volcar la cámara: decenas de fotos con nombres como `R0010042.JPG` que hay que subir, renombrar, ordenar y convertir en escenas. El **importador de cámara 360** lo convierte en tres pasos guiados.

Se abre desde **Biblioteca de medios → Importar de cámara 360**.

## Paso 1: fotos

1. Arrastra todas las fotos (o vídeos 360) de la cámara a la ventana.
2. Elige el **tour de destino**.
3. La lista se ordena sola por fecha de captura; puedes reordenar arrastrando cada fila.
4. Renombra cada foto haciendo clic en su nombre, o usa **Renombrar por patrón**: escribe por ejemplo `Planta 1 ({n})` y `{n}` se sustituye por el número de orden.
5. Pulsa **Subir**: cada fila muestra su progreso (las fotos esféricas se detectan y trocean automáticamente en tiles multirresolución).

## Paso 2: plano (opcional)

Si el tour tiene un plano de planta, el importador te lo enseña y va pidiendo **un clic por foto, en orden**: cada clic coloca la siguiente foto sobre el plano con su número. Un clic sobre un número ya colocado lo quita para recolocarlo.

Este paso deja el plano del tour terminado antes incluso de crear las escenas. Si el tour no tiene plano, el paso se salta (puedes añadir uno después desde las **áreas** del lienzo, en el modo **Plano**).

## Paso 3: escenas

Un resumen muestra las escenas que se van a crear, en el orden de la lista. La opción **Conectar en secuencia** crea hotspots de navegación de ida y de vuelta entre escenas consecutivas: son marcadores de verdad, visibles y pulsables en el panorama, y en el grafo aparecen como las aristas. Nacen en una posición provisional y marcados «sin colocar», así que conviene abrirlos y arrastrarlos a su sitio.

Pulsa **Crear N escenas** y después **Abrir en el editor** para ajustar vistas iniciales, títulos y hotspots.

## Consejos

- Las fotos quedan **asignadas al tour** en la biblioteca: el filtro «por tour» de la biblioteca las agrupa.
- El importador deduplica por contenido: si repites una foto ya subida, se reutiliza sin ocupar cuota.
- Puedes ejecutar el importador varias veces sobre el mismo tour (por plantas, por alas del edificio…).
