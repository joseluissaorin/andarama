---
title: "Visita virtual de un museo: cómo se hace y cuánto cuesta"
description: "Qué necesita una visita virtual de museo en 360: fotos, cartelas ancladas, audioguía, idiomas, quiosco y accesibilidad. Costes por partida y software."
lang: es
slug: visita-virtual-museo
cluster: verticales
fecha: 2026-10-06
autor: jose-luis-saorin
faq:
  - q: "¿Cuánto cuesta una visita virtual de un museo?"
    a: "Depende sobre todo de la fotografía. Con cámara propia y personal del museo, el coste del software puede ser cero (Andarama instalado) o unos cientos al año alojado; con un fotógrafo profesional para veinte salas, el grueso del presupuesto es su jornada. Con Matterport se suman cuotas anuales por espacio."
  - q: "¿Necesitamos un modelo 3D como el de Matterport?"
    a: "Para una visita que se recorre, se lee y se escucha, no. Unas fotos 360 bien hechas con textos, audio y obras en alta resolución cumplen mejor y cuestan una fracción. El 3D tiene sentido para medir o para documentación arquitectónica."
  - q: "¿Se puede poner en una pantalla dentro del museo?"
    a: "Sí. El modo quiosco recorre el museo solo, deja que cualquier visitante tome el mando y vuelve a empezar tras un minuto sin actividad. Y el paquete PWA funciona sin conexión."
  - q: "¿La visita seguirá funcionando dentro de diez años?"
    a: "Con Andarama, sí: la visita se exporta como paquete estático que funciona en cualquier servidor sin la plataforma detrás, el formato tour.json está documentado y el programa es de código abierto."
---

Una **visita virtual de un museo** se hace con fotos 360 de las salas, textos y audios anclados junto a cada obra, un plano para situarse, versiones en los idiomas de los visitantes y una manera de publicarla en la web del museo y en una pantalla de la entrada. El coste lo marca casi todo la fotografía: el software puede ir de cero (código abierto instalado en un servidor propio) a varios cientos al año alojado, y Matterport, la opción que más se cita, cobra cuotas anuales por espacio y no deja llevarse la visita. Esta guía recorre las partidas, los tiempos y las decisiones, con cifras honestas.

## Qué debe tener una visita virtual de museo

Antes de hablar de dinero, conviene saber qué se está comprando. Una visita que funcione, es decir, que la gente recorra más de dos minutos, tiene:

- **Recorrido claro**: sala a sala, con flechas donde están las puertas y un plano con la posición del visitante.
- **Contenido anclado**: la cartela junto al cuadro, no en un menú aparte. Texto corto, imagen en alta resolución con zoom, audio de la audioguía.
- **Obras en detalle**: para un lienzo, un manuscrito o un retablo, una escena gigapíxel 2D con zoom tipo mapa vale más que la foto 360 de la sala.
- **Idiomas**: al menos los de los visitantes habituales, con el selector en el visor.
- **Accesibilidad**: una versión en texto que un lector de pantalla pueda recorrer, foco visible, sin animaciones para quien las evita.
- **Dos salidas**: la web del museo (embebida) y, si hay presupuesto, una pantalla en la entrada en modo quiosco.
- **Datos**: cuánta gente entra, qué salas ven y cuánto se quedan, sin cookies ni avisos.

Andarama cubre todos estos puntos de serie: escenas de panorama, vídeo 360 y gigapíxel 2D; dieciocho tipos de hotspot; traducciones por escena y por hotspot; versión accesible en texto; modo quiosco; analítica sin cookies. Están descritos en la [documentación de escenas](https://docs.andarama.com/usuario/escenas/) y de [publicación](https://docs.andarama.com/usuario/publicar/).

## Cómo se hace, paso a paso

1. **Fotografía.** Una foto 360 por punto de vista: una o dos por sala pequeña, tres o cuatro por sala grande. Con una cámara de gama media (8K) en un monópode, un fotógrafo con experiencia hace entre veinte y cuarenta panorámicas en una jornada, con luz controlada y sin público.
2. **Obras.** Las piezas que merezcan zoom se fotografían aparte, en alta resolución, y entran como escenas gigapíxel.
3. **Montaje.** Se suben las fotos (el [importador de cámara 360](https://docs.andarama.com/usuario/importador/) crea las escenas de golpe y las coloca sobre el plano), se conectan las salas en el grafo y se ajusta la orientación de llegada a cada una.
4. **Contenido.** Cartelas como hotspots de texto, audioguía como hotspots de audio (o narración de escena), documentos como PDF, y el comparador para los «antes y después» de una restauración.
5. **Idiomas.** En Traducciones se añaden los idiomas y se traducen los textos, o se exporta el CSV para la agencia y se reimporta.
6. **Publicación.** Enlace público, código de inserción para la web del museo, tarjeta social con la vista de la sala inicial y, si se quiere, dominio propio (`visita.museo.es`).
7. **Pantalla en sala.** El mismo tour en modo quiosco: recorre el museo solo, deja que cualquier visitante tome el mando y vuelve a empezar tras un minuto sin actividad. Para pantallas sin red, el paquete PWA funciona sin conexión.

Un museo pequeño (ocho salas, cuarenta obras destacadas, dos idiomas) se monta en una o dos semanas de trabajo de una persona, incluida la fotografía.

## Cuánto cuesta, por partidas

Las cifras son orientativas para España en 2026 y varían mucho según la ciudad y el profesional; sirven para saber dónde está el dinero.

| Partida | Con medios propios | Con profesionales |
|---|---|---|
| Fotografía 360 | Cámara de gama media (unos cientos de euros, reutilizable) y una jornada de personal | Jornada de fotógrafo especializado; el precio se negocia por jornada o por panorámica |
| Fotografía de obras en alta resolución | Cámara del museo | Fotógrafo de patrimonio |
| Textos, audio, traducciones | Personal del museo | Locución y agencia de traducción, por palabra o por minuto |
| Software (edición y publicación) | 0 € instalado en el servidor del museo | Alojado: desde 2 $ al mes (un recorrido) hasta 500 $ al año (Excursión: sin insignia, dominio propio) |
| Pantalla de quiosco | Un televisor y un mini PC o tableta con navegador | Instalación y soporte |
| Mantenimiento | Actualizar textos y fotos cuando cambie la exposición | Contrato de soporte |

Lo que casi nunca se cuenta y es lo más caro: **el tiempo del personal** para escribir cartelas, grabar audio y revisar traducciones. El software es la partida menor.

Para comparar, Matterport, que muchos museos consideran primero, cobra sus planes al año por número de espacios activos y el tour solo funciona alojado en su nube; las cifras que hemos podido reunir están en [cuánto cuesta Matterport](/blog/matterport-precio/), con las advertencias de lo que no hemos podido verificar. Para una visita que se lee y se escucha, no hace falta el modelo 3D.

## Elegir el software: las preguntas que importan

- **¿Se puede llevar la visita?** Un museo dura más que cualquier proveedor. Con Andarama, la visita se exporta como ZIP estático que funciona en cualquier servidor, el formato `tour.json` está documentado y el programa es de código abierto (EUPL-1.2). Si el proveedor desaparece, la visita no.
- **¿Dónde están los datos?** La analítica de Andarama no usa cookies ni guarda direcciones IP; si se instala en el servidor del museo, nada sale de allí. Está pensado para instituciones públicas con RGPD y sin ganas de banners.
- **¿Se puede embeber en la web del museo?** Con un web component o un iframe, y con el [plugin de WordPress](/wordpress/) si la web es WordPress.
- **¿Funciona en una pantalla de la entrada?** Modo quiosco y PWA sin conexión.
- **¿Y en gafas?** El mismo enlace abre el modo RV en Meta Quest, Pico o Vision Pro, sin instalar nada; útil para un rincón de realidad virtual o para llevar el museo a un centro escolar.
- **¿Quién lo mantiene?** La instalación en Cloudflare cabe en la capa gratuita y la de Docker es un fichero; para quien prefiera no mantener nada, el plan alojado. La [página de universidades e instituciones](/universidades/) resume las opciones de factura en euros bajo pedido, SSO (solo en la instalación propia) e instancia propia con soporte.

## Dos errores frecuentes

**Hacer las fotos con público y con luz de un día cualquiera.** Una visita virtual se ve durante años; merece una mañana de cierre, luces encendidas y vitrinas limpias.

**Volcar la web entera en la visita.** El visitante virtual lee menos que el real. Cartelas de tres líneas, un audio de treinta segundos, un enlace a la ficha completa para quien quiera más. Andarama permite hasta dieciocho tipos de contenido; no hay que usarlos todos en cada sala.

## Por dónde empezar

Con dos salas y diez obras se prueba todo el flujo en una tarde: el [tutorial del primer tour](https://docs.andarama.com/tutoriales/primer-tour/) explica los pasos y la cuenta de prueba dura catorce días sin tarjeta. Si el museo depende de un ayuntamiento o de una universidad y prefiere una instancia propia, la [guía de despliegue](https://docs.andarama.com/despliegue/docker/) y la página de [instituciones](/universidades/) cuentan cómo.
