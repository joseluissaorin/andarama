---
title: "Escape room digital para clase: cómo montar uno en 360"
description: "Cómo crear un escape room digital en fotos 360: objetos escondidos, candados con variables, pistas y cerradura final. Sin cuentas para el alumnado."
lang: es
slug: escape-room-digital
cluster: docencia
fecha: 2026-09-24
autor: jose-luis-saorin
faq:
  - q: "¿Cuánto se tarda en montar un escape room digital en 360?"
    a: "Con las fotos hechas, una tarde: tres o cuatro escenas, media docena de objetos escondidos, dos candados y la cerradura final. Lo que más tiempo lleva es diseñar el guion y los enigmas, no la herramienta."
  - q: "¿Los alumnos necesitan cuenta?"
    a: "No. Con el plan Aula de Andarama entran con un código de clase, sin correo ni contraseña, y el docente ve el progreso de cada grupo. En una instalación propia tampoco hay cuotas ni planes."
  - q: "¿Funciona en la pizarra digital y en el móvil?"
    a: "Sí. Es una página web: se abre en la pizarra, en tabletas, en móviles y, si se quiere, en gafas de realidad virtual o con unas gafas de cartón."
  - q: "¿Puedo usar un escape room de otro docente?"
    a: "Dentro de una organización, un recorrido se puede guardar como plantilla para que otros docentes partan de él, y siempre se puede exportar como paquete. No hay todavía una galería pública de escape rooms; si haces uno que quieras compartir, escríbenos."
---

Un **escape room digital** en 360 es un recorrido por fotos esféricas (un aula, un laboratorio, un museo, la propia biblioteca del centro) en el que el alumnado tiene que encontrar objetos escondidos, resolver enigmas y abrir candados hasta llegar a una cerradura final. Se juega desde el navegador, en la pizarra digital, en tabletas o en el móvil, y se puede montar en una tarde con un editor de recorridos que tenga variables de estado. Esta guía explica cómo hacerlo con Andarama, paso a paso, y qué decisiones de diseño separan un escape room que funciona de uno que se abandona a los cinco minutos.

## Qué necesitas antes de empezar

- **Fotos 360** de tres a seis espacios. Sirven las de una cámara 360 (el centro puede comprar una por poco dinero o pedirla prestada), pero también valen panoramas libres de Wikimedia Commons si el escape room transcurre en un lugar histórico o en un museo.
- **Un guion**: quiénes son los jugadores, qué ha pasado, qué tienen que conseguir y en cuánto tiempo. Sin historia, los candados son un examen con otro nombre.
- **Los enigmas**, uno por candado, con su solución y la pista que lleva a ella.
- **Andarama**: la cuenta de prueba de catorce días, el [plan Aula](/aula/) o una instalación propia. Las piezas que usaremos (tesoros, contadores, condiciones de visibilidad, quiz con compuerta) están todas en la [documentación de docencia](https://docs.andarama.com/usuario/docencia/).

## Las cuatro piezas del escape room en Andarama

Un escape room es, técnicamente, un puñado de variables que cambian de valor y de cosas que aparecen o desaparecen según esas variables. Andarama tiene cuatro tipos de hotspot que encajan:

| Pieza | Hotspot | Qué hace |
|---|---|---|
| Objeto escondido | **Tesoro** | Se coloca en la escena y el visor lleva la cuenta de los encontrados. Se ve como una gema; para esconderlo de verdad se cambia el icono o se quita el fondo circular |
| Candado | **Quiz con compuerta** | Una pregunta que retiene al jugador en la escena hasta que acierta: los pasos a otras escenas se ven apagados y, al pulsarlos, se abre la pregunta |
| Interruptor | **Contador/estado** | Cambia una variable del tour (abre una puerta, enciende la luz, suma una pista) |
| Puerta que se abre | **Condiciones de visibilidad** | Cualquier hotspot puede aparecer solo cuando una variable tiene cierto valor |

Con eso se construye casi todo: «cuando hayas encontrado las tres piezas del mapa, aparece el paso a la cripta»; «la caja fuerte solo se abre si respondes bien a la pregunta»; «al pulsar el interruptor se enciende la lámpara y se ve el código escrito en la pared».

## Paso a paso

### 1. Sube las fotos y crea las escenas

En el Studio, crea un tour nuevo, sube los panoramas y añade una escena por espacio. Si son muchas fotos, el [importador de cámara 360](https://docs.andarama.com/usuario/importador/) las sube en lote, las ordena y crea las escenas de golpe. Pon a cada escena un título que forme parte del relato («El despacho del profesor Ruiz») y no el nombre del fichero.

### 2. Dibuja el recorrido en el grafo

En la pestaña Grafo, arrastra de una escena a otra para crear los pasos. Deja claro qué salas son de libre acceso y cuáles están cerradas al principio: las cerradas no tendrán paso visible hasta que se cumpla su condición.

### 3. Esconde los objetos

Coloca hotspots de **Tesoro** en las escenas: dentro de un cajón, detrás de una planta, en el reflejo de una ventana. Cambia el icono por algo discreto o quítale el fondo, y ajusta el tamaño para que sea pequeño pero pulsable (piensa en los dedos sobre una tableta). El contador de encontrados es lo que dará la sensación de progreso.

### 4. Pon los candados

Para cada puerta cerrada, un hotspot de **Quiz** con la compuerta activada: la pregunta puede ser de respuesta única, múltiple o verdadero/falso. Escribe el enunciado como parte del relato y usa el campo de retroalimentación para dar una pista cuando se falla, no solo para decir «incorrecto». Los intentos se pueden limitar; en un escape room, mejor dejarlos ilimitados y penalizar con tiempo.

### 5. Añade interruptores y puertas condicionadas

Con un hotspot de **Contador/estado** puedes crear acciones que cambien variables (`set`, `inc`, `dec`, `toggle`) y, en las **Condiciones** de cualquier otro hotspot, hacer que aparezca solo cuando la variable vale lo que toca. Ejemplo clásico: tres piezas del mapa escondidas como hotspots de estado (cada una suma uno a la variable `piezas` y se oculta a sí misma con su propia condición); cuando `piezas` llega a 3, aparece el paso a la sala final. Los tesoros del paso anterior llevan su propio contador y no tocan variables: sirven para el coleccionismo, no para abrir puertas.

### 6. Reparte las pistas

Los hotspots de **Texto** (con Markdown), **Imagen**, **Audio** y **Vídeo** sirven para dejar pistas por las escenas: una nota manuscrita, un mensaje de voz, un vídeo proyectado sobre la pared. El hotspot de **PDF** vale para documentos largos y el **Comparador** (dos imágenes con deslizador) para un «antes y después» que esconda una diferencia.

### 7. La cerradura final y el informe

La última escena lleva el quiz definitivo. En Ajustes del tour se fija la puntuación mínima, se activa el informe final y, si quieres, el **certificado de finalización** en PDF con el nombre de cada participante: el «habéis escapado» que se llevan a casa.

### 8. Prueba y publica

La pestaña Previsualizar recorre el borrador como lo verá el alumnado. Juégalo tú entero; luego pásaselo a un compañero que no conozca las soluciones y mide cuánto tarda. Publica y comparte el enlace o el código QR en la pizarra.

## Cómo entran los alumnos

Con el [plan Aula](/aula/) (42 $ al año por docente) el alumnado entra con un **código de clase**, sin correo ni contraseña, y el docente ve el progreso de cada grupo y exporta las notas en CSV. En una instalación propia del centro (el programa es de código abierto y hay un [ejecutable de escritorio](https://docs.andarama.com/despliegue/escritorio/)) no hay planes que limiten nada.

Si el centro usa Moodle, el recorrido se puede lanzar desde el propio campus por LTI y la nota vuelve al libro de calificaciones; lo contamos en [cómo meter un recorrido 360 en Moodle](/blog/recorrido-360-moodle/).

## Diseño: lo que hace que funcione

- **Tiempo cerrado.** Cuarenta minutos y un reloj visible en la pizarra. Sin límite, la tensión desaparece.
- **Grupos de tres o cuatro** con una tableta o un ordenador por grupo. Uno lee, otro navega, otro apunta.
- **Enigmas encadenados, no en paralelo.** Cada solución abre la siguiente sala. Con todo abierto desde el principio, el grupo se dispersa.
- **Pistas de rescate.** Ten preparadas dos pistas por candado para dárselas en voz alta a los grupos atascados, a cambio de un minuto de penalización. Dentro del recorrido, un hotspot de **Etiqueta flotante** con un texto ambiguo cerca del candado sirve de pista suave para todos.
- **Contenido en el enigma, no en la decoración.** El candado debe exigir el conocimiento que quieres trabajar (la fórmula, la fecha, la traducción), no una adivinanza genérica.
- **Recompensa visible.** El contador de tesoros, la puerta que aparece, el certificado final. El progreso tiene que verse.

## Con gafas o sin ellas

El mismo escape room funciona en gafas de realidad virtual (Meta Quest, Pico) abriendo la dirección en su navegador: los tesoros, los quiz y los paneles se accionan con las manos dentro de la sesión. Y en cualquier móvil funciona el modo cartón. No hace falta comprar nada para empezar: en la pizarra y en las tabletas ya se juega entero, y las gafas son una capa opcional. Sobre esto hay más en [realidad virtual en educación sin comprar gafas](/blog/realidad-virtual-educacion/).

¿Buscas ideas concretas por asignatura? Tenemos [doce propuestas de escape room educativo](/blog/escape-room-educativo-ideas/), de Historia a Química.
