---
title: "Andarama vs 3DVista: pago único de escritorio frente a código abierto"
description: "3DVista cuesta 499 $ una vez y es el escritorio más completo; Andarama es de código abierto, gratis instalado y alojado desde 2 $. Precio, RV y SCORM."
lang: es
slug: andarama-vs-3dvista
cluster: competidores
fecha: 2026-10-18
autor: jose-luis-saorin
plantilla: vs
competidor: 3dvista
faq:
  - q: "¿3DVista tiene cuota mensual?"
    a: "No para el programa: Virtual Tour Pro es una licencia perpetua de 499 $. El alojamiento de 3DVista es opcional, desde 99 € al año; puedes usar cualquier otro servidor porque el tour se exporta en HTML."
  - q: "¿Cuál es más barato a largo plazo?"
    a: "Andarama instalado cuesta cero. Frente a Andarama alojado, 3DVista (499 $ una vez) sale más barato que Paseo (200 $ al año) a partir del tercer año, si no necesitas alojamiento ni funciones de aula."
  - q: "¿Cuál tiene mejor realidad virtual?"
    a: "Los dos tienen modo RV. Andarama hace WebXR con manos, mandos y paneles dentro de la sesión, sin instalar nada en las gafas; de 3DVista no hemos comprobado hasta dónde llega su modo, así que en la tabla figura como sí sin más detalle."
  - q: "¿Los dos sirven para e-learning?"
    a: "Sí. Los dos tienen quiz y exportan SCORM. Andarama añade certificado PDF, escape room, búsqueda del tesoro y visitas guiadas en vivo, y el alumnado no necesita cuenta para jugar un recorrido."
---

**3DVista Virtual Tour Pro** es un programa de escritorio de Granada, para Windows y macOS, de pago único (499 $) y probablemente el más completo de los editores «clásicos» de tours 360: hotspots avanzados, e-learning con quiz y SCORM, plantas, vídeo 360 y un control enorme sobre el aspecto. **Andarama** es una aplicación web de código abierto, gratis si te la instalas o alojada desde 2 $ al mes, con editor colaborativo, realidad virtual WebXR y herramientas de aula. Los dos exportan el tour para alojarlo donde quieras, lo que ya los separa de la mayoría del sector; la elección depende del flujo de trabajo (escritorio o navegador), de si se trabaja en equipo, del presupuesto y de cuánto importa el código abierto.

## Qué es cada uno

**3DVista** se instala en el ordenador. Se importan las fotos, se monta el tour en su interfaz y se exporta como HTML5 que funciona en cualquier servidor. Ofrece un alojamiento propio, opcional, desde 99 € al año. La licencia es perpetua; las versiones mayores pueden tener coste de actualización. Descuentos educativos bajo solicitud.

**Andarama** se usa en el navegador, contra una instancia que puede ser tu propio ordenador (un ejecutable que se abre con doble clic), tu servidor (Docker), tu cuenta de Cloudflare o andarama.com. El código es abierto (EUPL-1.2), el formato `tour.json` está documentado y los tours se exportan como ZIP estático, HTML único, PWA o SCORM.

## Precios, comprobados

Andarama es nuestra; tenlo en cuenta al leer. Los precios de 3DVista, [comprobados en su tienda](https://www.3dvista.com/en/store/) el 27 de septiembre de 2026:

- **Virtual Tour Pro**: 499 $, pago único. Sin límite de proyectos.
- **Alojamiento** (opcional): desde 99 € al año, con límites de espacio. Puedes usar tu propio servidor.

Los de Andarama:

- **En tu casa**: 0 €, sin límite de recorridos.
- **Andar**: 2 $ al mes, 1 recorrido, 5 GB.
- **Aula**: 42 $ al año, 5 recorridos, 10 GB.
- **Paseo**: 20 $ al mes o 200 $ al año, 10 recorridos, 50 GB.
- **Excursión**: 500 $ al año, 500 recorridos, 100 GB, sin insignia y con dominio propio.
- **Formación**: 99 $ al mes o 990 $ al año, 100 recorridos, 200 GB, SCORM, marca blanca y dominio propio.
- **De por vida**: 1000 $ una vez, 1000 recorridos, 200 GB.

La comparación honesta: para un profesional que hace muchos tours y prefiere pagar una vez, **3DVista es más barato que Andarama alojado** a partir del tercer año (499 $ frente a 200 $ anuales de Paseo), y no necesita ningún alojamiento de nadie porque exporta HTML. **Andarama instalado cuesta cero**, también sin alojamiento ajeno, y es el equivalente directo del flujo de 3DVista: el programa en tu máquina, los tours exportados a tu servidor. La diferencia está entonces en lo que hace cada programa, no en el precio.

## Escritorio frente a navegador

Es la diferencia de fondo y no hay una respuesta correcta.

**3DVista** trabaja en local, con los ficheros en tu disco, sin depender de la red. Es cómodo para un fotógrafo que procesa lotes grandes, y el programa es rápido en una máquina potente. A cambio, es una interfaz veterana con curva de aprendizaje alta, una licencia por puesto, y la colaboración se hace pasándose ficheros.

**Andarama** trabaja en el navegador, pero el teselado de las fotos también se hace en tu máquina (con la tarjeta gráfica) antes de subir. Tiene presencia y bloqueo por escena para que varias personas editen el mismo tour, comentarios anclados, historial de versiones con restauración, y cuentas por organización con roles. Y funciona desde cualquier ordenador, incluida una tableta, sin instalar nada.

## Editor y funciones

Los dos son editores completos y aquí el empate es real, con matices:

| | 3DVista | Andarama |
|---|---|---|
| Hotspots | Muy variados, con mucho control de estilo | 18 tipos, incluidos quiz, tesoro, estado, polígono, comparador y modelo 3D |
| Skins y aspecto | Editor de skins muy potente | Un visor cuidado, con opciones por tour; menos personalizable a bajo nivel |
| Grafo del recorrido | No como tal | Sí: cada flecha es un hotspot; orientación de llegada por camino |
| Plantas y mapa | Plantas | Áreas con plano y nivel, radar, y mapa geográfico sobre OpenStreetMap |
| Idiomas | Sí | Sí, por escena y por hotspot, con CSV |
| Vídeo 360 | Sí | Sí, con hotspots por instante |
| Accesibilidad | Depende del skin | Versión en texto, foco visible, movimiento reducido, texto alternativo por escena (el editor avisa si falta) |
| Colaboración | Ficheros | Presencia, bloqueo por escena, comentarios, versiones |

Si lo que buscas es control absoluto del aspecto, 3DVista gana. Si lo que buscas es un flujo rápido de muchas escenas bien conectadas y varias personas editando, Andarama.

## Realidad virtual

Los dos tienen modo RV. En Andarama es WebXR: se abre el tour en el navegador de las Meta Quest, Pico o Vision Pro y aparecen las manos con sus articulaciones y los mandos; los paneles de texto, galería, vídeo, quiz y comparador se dibujan dentro de la sesión, y el tour exportado conserva la RV si se sirve por HTTPS. De 3DVista no hemos comprobado hasta dónde llega su modo (manos, paneles), así que en la tabla figura como «sí» sin más detalle.

## Docencia y formación

Los dos sirven para e-learning y es de las pocas comparativas donde podemos decirlo: 3DVista tiene quiz y exporta SCORM, y su exportación está pensada para LMS. Andarama tiene quiz con nota, mínimo para aprobar, informe y certificado PDF; SCORM 1.2 y 2004; y añade búsqueda del tesoro, escape room con variables y visitas guiadas en vivo, sin que el alumnado necesite cuenta para jugar. Tiene también una integración LTI 1.3, pero está en pruebas y la nota todavía no vuelve sola a Moodle. Para un curso SCORM, cualquiera de los dos.

## Street View y marca

3DVista publica en Google Street View; Andarama no, de momento. Los dos permiten marca blanca y dominio propio (en Andarama, en Excursión, Formación y De por vida, y sin restricciones en la instalación propia). La analítica de Andarama no usa cookies ni guarda IP; de 3DVista no lo hemos comprobado.

## Entonces, ¿cuál?

- **3DVista**, si eres un profesional que hace muchos tours, trabajas solo, quieres pagar una vez, necesitas control total del skin y publicas en Street View.
- **Andarama**, si trabajas en equipo, das clase o formación con juegos (escape room, búsqueda del tesoro), quieres realidad virtual sin instalar nada en las gafas, prefieres código abierto que se puede auditar, o quieres empezar por 2 $ al mes o por cero.

Los dos se prueban: 3DVista con su versión de prueba, Andarama con catorce días sin tarjeta o [instalándotela](https://docs.andarama.com/despliegue/escritorio/). Y si también miras a Matterport o a Kuula, están en [alternativas a Matterport](/blog/alternativas-a-matterport/) y en [Andarama vs Kuula](/blog/andarama-vs-kuula/).
