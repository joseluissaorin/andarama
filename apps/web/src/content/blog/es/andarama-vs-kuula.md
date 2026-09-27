---
title: "Andarama vs Kuula: qué cambia cuando el software es de código abierto"
description: "Kuula es la plataforma 360 de los fotógrafos: gratis para empezar, 24 $ al mes en Pro. Andarama es de código abierto y se aloja desde 2 $. Comparativa."
lang: es
slug: andarama-vs-kuula
cluster: competidores
fecha: 2026-09-13
actualizado: 2026-09-27
autor: jose-luis-saorin
plantilla: vs
competidor: kuula
faq:
  - q: "¿Cuánto cuesta Kuula en 2026?"
    a: "Basic es gratis con hasta 300 publicaciones; Pro cuesta 24 $ al mes o 240 $ al año; Business, 48 $ al mes o 432 $ al año. Comprobado en su página de precios el 27 de septiembre de 2026."
  - q: "¿Puedo descargar un tour de Kuula y alojarlo en mi web?"
    a: "Se puede insertar con un código, pero no hemos encontrado en ningún plan una descarga del tour como paquete para alojarlo fuera de Kuula."
  - q: "¿Andarama publica en Google Street View?"
    a: "No, de momento. Si publicar en Street View es imprescindible para ti, Kuula es mejor opción."
---

Kuula lleva años siendo la respuesta fácil a «¿con qué hago un tour 360?». Tiene un plan gratuito que de verdad sirve, un editor que se entiende en diez minutos y una comunidad enorme de fotógrafos que publican allí sus panoramas. Si buscas alternativas a Kuula, lo normal es que sea por una de tres razones: el precio cuando pasas de un tour, la sensación de que tus recorridos viven en casa ajena, o porque necesitas algo que Kuula no hace (quiz con nota, SCORM, un campus virtual). Vamos por partes.

## Qué es cada cosa

**Kuula** es un servicio en la nube: subes las fotos, montas el tour en su editor y lo publicas en kuula.co o insertado en tu web. No hay nada que instalar y no hay versión que puedas tener en tu servidor.

**Andarama** es un programa de código abierto (licencia EUPL-1.2) para hacer lo mismo, con dos maneras de usarlo: instalártelo tú (un ejecutable de escritorio, Docker o tu propia cuenta de Cloudflare) sin pagar nada y sin cuotas, o dejar que lo alojemos en andarama.com con planes desde 2 $ al mes. Es la misma aplicación en los dos casos; no hay una versión recortada.

## Precios, con las cifras de hoy

Los precios de Kuula, comprobados en [su página de precios](https://kuula.co/page/pricing) el 27 de septiembre de 2026 (Andarama es nuestra, conviene saberlo al leer):

- **Basic**: gratis. Hasta 300 publicaciones y 100 subidas al mes, con la marca de Kuula y sin el editor de tours.
- **Pro**: 24 $ al mes, o 20 $ al mes si pagas el año entero (240 $). Editor de tours, tu logotipo en lugar del de Kuula, audio e iconos propios, hasta 100 000 publicaciones.
- **Business**: 48 $ al mes, o 36 $ al mes pagando anual (432 $). Dominio propio, varios logotipos, tours con contraseña y publicaciones ilimitadas.

Los de Andarama:

- **En tu casa**: 0 €. El programa entero, en tu ordenador o en tu servidor, sin límite de recorridos.
- **Andar**: 2 $ al mes por 1 recorrido y 5 GB.
- **Aula**: 42 $ al año por docente, con 5 recorridos y 10 GB; el alumnado entra sin cuenta a jugar los quiz y los escape room.
- **Paseo**: 20 $ al mes o 200 $ al año por 10 recorridos y 50 GB.
- **Excursión**: 500 $ al año por 500 recorridos y 100 GB, sin insignia y con dominio propio.
- **Formación**: 99 $ al mes o 990 $ al año, con paquete SCORM, marca blanca y dominio propio.
- **De por vida**: 1000 $ una sola vez, 1000 recorridos y 200 GB.

La lectura honesta: si publicas muchos tours y solo necesitas un visor bonito con la marca quitada, Kuula Pro a 20 $ al mes anual y Andarama Paseo a 200 $ al año cuestan prácticamente lo mismo. La diferencia aparece en los extremos: un solo tour cuesta 2 $ al mes en Andarama y 20 $ en Kuula, y un uso institucional con cientos de recorridos cuesta 500 $ al año en Andarama frente a 432 $ al año en Kuula Business… solo que Kuula no ofrece quiz con nota ni SCORM a ningún precio. Y en tu propio servidor Andarama cuesta cero.

## Lo que pasa con tus tours cuando dejas de pagar

Este es el punto en el que nos parece que la comparación deja de ser de precios. En Kuula no hemos encontrado, en ningún plan, una manera de descargar el tour para alojarlo fuera: su «Export Editor» ajusta el enlace y el código de inserción, no genera un paquete. El recorrido existe mientras Kuula exista y mientras tu cuenta esté activa.

En Andarama, la exportación es parte del producto en todos los planes: un ZIP estático con el HTML, el visor y las teselas que se sube a cualquier hosting; un HTML único para abrir desde un pendrive; y una PWA para verlo sin conexión. El paquete SCORM para un campus virtual va en el plan Formación. El formato `tour.json` está documentado y versionado. Lo decimos a menudo y lo escribimos aquí también: los recorridos siguen funcionando si Andarama desaparece.

## Editor y visor

Kuula gana en sencillez. Su editor es lineal y cómodo, y para un fotógrafo que quiere subir veinte panoramas y enlazarlos, es difícil de superar.

El editor de Andarama es más grande porque hace más cosas: el grafo dibuja el plano del recorrido y cada flecha es un hotspot; la orientación de llegada a cada sala depende del camino por el que se entra; hay historial de versiones, comentarios para el equipo, presencia cuando editáis varios y traducciones lado a lado. Diecisiete tipos de hotspot (texto, imagen, galería, vídeo proyectado sobre una pared, audio espacial, PDF, modelo 3D, formulario, comparador, quiz, polígono, tesoro…) frente a los tipos básicos de Kuula. Cuesta un poco más de aprender; a cambio se llega bastante más lejos.

En el visor los dos son buenos. Andarama añade proyecciones (little planet, ojo de pez, Panini), brújula con norte real, planos de planta con radar, vídeo 360 con hotspots por instante y audio espacial que gira con la cabeza.

## Realidad virtual

Los dos tienen modo RV. Kuula ofrece un modo para gafas y para cartón. Andarama hace WebXR de verdad: manos con sus articulaciones, pinza de pulgar e índice, mandos con rayo, y los paneles (texto, galería, vídeo, quiz, comparador) dibujados dentro de la sesión, de modo que un recorrido con preguntas se puede completar sin quitarse las gafas. Lo exportado conserva la realidad virtual.

## Docencia y formación

Aquí no hay comparación posible, y lo decimos sin presumir: Kuula no está pensado para el aula. Andarama trae de serie quiz con nota, mínimo para aprobar, intentos, informe final y certificado PDF; búsqueda del tesoro y escape room con compuertas y variables de estado; visitas guiadas en directo, en las que la clase sigue al docente desde su navegador; y paquetes SCORM 1.2 y 2004 para llevar la nota a Moodle, Canvas o Blackboard (plan Formación). Con LTI 1.3, Moodle abre el tour directamente y la nota llega sola al libro de calificaciones. El plan Aula cuesta 42 $ al año por docente, y el alumnado no necesita cuenta.

## Street View y comunidad

Kuula publica directamente en Google Street View, y su comunidad de fotógrafos es una manera real de que tus panoramas los vea gente. Andarama no publica en Street View (de momento) y no tiene una red social alrededor. Si eso es lo que buscas, Kuula sigue siendo la mejor opción.

## Datos y privacidad

Andarama no usa cookies para la analítica de los visitantes ni guarda direcciones IP: visitas, escenas y hotspots agregados, y ya. Si te lo instalas, los datos están en tu servidor. De Kuula no hemos podido comprobar cómo funciona su analítica de visitantes, así que en la tabla ese campo queda sin datos.

## Entonces, ¿cuál?

- **Kuula**, si eres fotógrafo, quieres publicar rápido, te importa Street View y la comunidad, y no te preocupa que los tours vivan en su nube.
- **Andarama**, si quieres tener el programa (y los tours) en tu mano, pagas por un solo recorrido, das clase o formación, necesitas SCORM, o simplemente prefieres que el software que usas sea de código abierto y se pueda auditar.

Y si tienes dudas, las dos se prueban gratis: Kuula con su plan Basic y Andarama con catorce días sin tarjeta, o instalándotela, que no caduca nunca.
