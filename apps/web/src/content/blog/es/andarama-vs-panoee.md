---
title: "Andarama vs Panoee: plan gratuito generoso frente a código abierto"
description: "Panoee: proyectos ilimitados gratis con 3 GB y Pro a 22 $ al mes. Andarama: código abierto, gratis instalado y alojado desde 2 $. Precios comprobados."
lang: es
slug: andarama-vs-panoee
cluster: competidores
fecha: 2026-09-27
autor: jose-luis-saorin
plantilla: vs
competidor: panoee
faq:
  - q: "¿Panoee es gratis de verdad?"
    a: "Sí: el plan gratuito permite proyectos ilimitados con 3 GB de almacenamiento. Es de los más generosos del sector. Pro, a 22 $ al mes o 200 $ al año, añade dominios propios, logotipo y más tipos de hotspot; el almacenamiento sigue en 3 GB salvo que se compre más."
  - q: "¿Cuál es más barato para un solo tour?"
    a: "Panoee gratis, si cabe en 3 GB y no te importa la marca. Si quieres el tour sin marca, Andarama Andar cuesta 2 $ al mes; y Andarama instalado en tu ordenador cuesta cero, sin límite de tours."
  - q: "¿Cuál sirve para dar clase?"
    a: "Andarama: quiz con nota, escape room, búsqueda del tesoro y SCORM; el alumnado no necesita cuenta para jugar. Panoee no tiene funciones de docencia ni plan educativo conocido."
  - q: "¿Se pueden exportar los tours?"
    a: "En Panoee, la exportación completa cuesta 19 $ por proyecto, en un único pago. En Andarama, en todos los planes y en la instalación propia: ZIP estático, HTML único, PWA y SCORM."
---

**Panoee** es una plataforma de tours 360 en la nube con uno de los planes gratuitos más generosos del sector (proyectos ilimitados con 3 GB) y un editor moderno; su plan Pro cuesta 22 $ al mes o 200 $ al año. **Andarama** es un programa de código abierto que se instala gratis o se aloja desde 2 $ al mes, con exportación en todos los planes, realidad virtual WebXR y herramientas de docencia. Si buscas «alternativas a Panoee» o dudas entre los dos, la decisión se reduce a tres preguntas: cuánto te importa que el tour viva en una nube ajena, si necesitas quiz o campus virtual, y cuánto quieres pagar por el segundo tour.

## Qué es cada uno

**Panoee** (Vietnam) es un servicio SaaS: subes los panoramas, montas el tour en su editor y lo publicas alojado en Panoee o embebido en tu web. Su punto fuerte es el plan gratuito y un editor rápido de aprender, con buenos hotspots y un visor que rinde bien.

**Andarama** es una aplicación de código abierto (EUPL-1.2) con dos maneras de usarla: instalada (ejecutable de escritorio, Docker o tu cuenta de Cloudflare), gratis y sin cuotas, o alojada en andarama.com con planes desde 2 $ al mes. Es la misma aplicación en los dos casos.

## Precios, comprobados

Los de Panoee, comprobados en su [página de precios](https://panoee.com/pricing) el 27 de septiembre de 2026:

- **Gratis**: proyectos ilimitados, 3 GB de almacenamiento, con subdominio de Panoee.
- **Pro**: 22 $ al mes, o 200 $ al año (Pro+). Dominios propios, logotipo, más tipos de hotspot y analítica detallada; el almacenamiento sigue en 3 GB (el extra cuesta 0,15 $ por GB al mes).
- **Enterprise**: 99 $ al mes o 950 $ al año, 20 GB y dominio en marca blanca.
- **Exportación**: 19 $ por proyecto, en un único pago, según su [documentación](https://panoee.com/document/export-a-virtual-tour/).

No tiene plan educativo conocido.

Los de Andarama:

- **En tu casa**: 0 $, sin límite de recorridos.
- **Andar**: 2 $ al mes, 1 recorrido, 5 GB.
- **Aula**: 42 $ al año por docente, 5 recorridos, 10 GB, quiz con nota y escape room.
- **Paseo**: 20 $ al mes o 200 $ al año, 10 recorridos, 50 GB.
- **Excursión**: 500 $ al año, 500 recorridos, 100 GB, sin insignia y con dominio propio.
- **Formación**: 99 $ al mes o 990 $ al año, 100 recorridos, 200 GB, SCORM, marca blanca y dominio propio.
- **De por vida**: 1000 $ una vez, 1000 recorridos, 200 GB.

La lectura: **Panoee gana en el tramo gratuito** si te vale su marca y 3 GB (que son unas veinte o treinta fotos de 8K con sus teselas). En el tramo de pago, Panoee Pro y Andarama Paseo cuestan lo mismo al año (200 $), con la diferencia de que Andarama exporta en todos los planes sin coste añadido y Panoee cobra 19 $ por proyecto. Y para un solo tour sin marca ajena, Andarama Andar (2 $ al mes) no tiene equivalente en Panoee.

## Exportación y dependencia

Aquí está la diferencia de fondo. En Panoee, el tour vive en su nube; la exportación completa existe, pero se paga aparte (19 $ por proyecto). Sin ella, el tour existe mientras Panoee exista y tu cuenta esté activa.

En Andarama, la exportación forma parte del producto en todos los planes y en la instalación propia: un ZIP estático con el HTML, el visor y las teselas que funciona en cualquier hosting sin nada detrás; un HTML único para abrirlo desde un pendrive; una PWA para verlo sin conexión; y el paquete SCORM. El formato `tour.json` está documentado y versionado. Si Andarama desaparece, los recorridos siguen funcionando.

## Editor y visor

Los dos editores son buenos. El de Panoee es más lineal y probablemente más rápido de aprender para un primer tour. El de Andarama tiene un grafo donde cada flecha es un hotspot de navegación, orientación de llegada por camino (entrar en una sala desde el pasillo y desde la cocina son dos vistas distintas), plano por planta con radar, modo mapa sobre OpenStreetMap, historial de versiones, comentarios y presencia cuando editáis varios. Dieciocho tipos de hotspot: texto en Markdown, imagen con zoom, galería, vídeo proyectado sobre una pared, audio espacial, PDF, modelo 3D, web incrustada, formulario, comparador, quiz, polígono, tesoro, estado. Cuesta un poco más aprenderlo; llega bastante más lejos.

En el visor, Panoee rinde bien y tiene buena presencia. Andarama añade proyecciones (pequeño planeta, ojo de pez, Panini), brújula, plano con radar, vídeo 360 con hotspots por instante, audio que gira con la cabeza, versión accesible en texto y 116 KB comprimidos con el motor de RV dentro.

## Realidad virtual

Los dos tienen modo RV. En Andarama es WebXR completo: se abre el enlace en el navegador de las Meta Quest, Pico o Vision Pro, y aparecen las manos con sus articulaciones y los mandos; los paneles de texto, galería, vídeo, quiz y comparador se dibujan dentro de la sesión. En móvil sin WebXR, modo cartón con selección por mirada. De Panoee no hemos podido comprobar hasta dónde llega su modo RV (manos, paneles), así que en la tabla lo damos como «sí» sin más detalle.

## Docencia y formación

Panoee no está pensado para el aula y no tiene plan educativo. Andarama trae quiz con nota (mínimo para aprobar, intentos, informe, certificado PDF), compuerta que retiene en la escena hasta acertar, búsqueda del tesoro, escape room con variables, visitas guiadas en vivo, alumnado que juega sin crear cuenta y SCORM 1.2 y 2004. Por LTI 1.3, la nota llega además directamente al libro de calificaciones de Moodle. Si das clase o formación, no hay comparación; si no, este apartado te da igual.

## Marca, dominio y datos

Panoee permite logotipo y dominios propios en Pro, y dominio en marca blanca en Enterprise. Andarama quita la insignia y da dominio propio en Excursión, Formación y De por vida, y en la instalación propia no hay insignia que quitar. La analítica de Andarama no usa cookies ni guarda IP; de Panoee no hemos podido comprobarlo y la casilla queda sin datos.

## Entonces, ¿cuál?

- **Panoee**, si quieres empezar gratis con varios tours, la marca no te molesta, no vas a dar clase y no te preocupa dónde vive el tour.
- **Andarama**, si quieres tener el programa y los tours en tu mano, pagas por un solo recorrido, das clase o formación, necesitas SCORM, o prefieres código abierto que se puede auditar e instalar.

Las dos se prueban gratis: Panoee con su plan gratuito, Andarama con catorce días sin tarjeta o [instalándotela](https://docs.andarama.com/despliegue/escritorio/), que no caduca. Si Matterport también está en tu lista, tenemos [siete alternativas comparadas](/blog/alternativas-a-matterport/).
