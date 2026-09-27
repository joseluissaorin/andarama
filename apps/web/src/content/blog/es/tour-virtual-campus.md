---
title: "Tour virtual del campus: guía para universidades"
description: "Cómo hacer un tour virtual del campus para captación, acogida y docencia: plantas y mapa, idiomas, SSO y LTI, RGPD y quién lo mantiene. Plan por fases."
lang: es
slug: tour-virtual-campus
cluster: verticales
fecha: 2026-10-08
autor: jose-luis-saorin
faq:
  - q: "¿Quién debe hacer el tour virtual del campus: comunicación, informática o cada facultad?"
    a: "Lo que funciona es una organización con varios editores: comunicación coordina, cada facultad edita sus edificios y el servicio de informática decide dónde se aloja. Andarama tiene organizaciones con roles y bloqueo por escena para editar a la vez."
  - q: "¿Se puede alojar en la infraestructura de la universidad?"
    a: "Sí. El programa es de código abierto y se despliega con Docker o en una cuenta de Cloudflare de la universidad; con SSO por OIDC el profesorado entra con su cuenta institucional."
  - q: "¿Cómo se integra con el campus virtual?"
    a: "Con el paquete SCORM 1.2 o 2004, que informa de la finalización y la puntuación del quiz a Moodle o a cualquier LMS. La integración por LTI 1.3 está en pruebas y disponible bajo petición."
  - q: "¿Cuánto se tarda?"
    a: "Un campus de cinco edificios y sesenta puntos de vista se fotografía en dos o tres jornadas y se monta en dos semanas. El mantenimiento después es cambiar fotos cuando cambia algo."
---

Un **tour virtual del campus** hecho con criterio sirve para tres cosas a la vez: captar estudiantes que aún no han pisado la universidad, acoger a los que llegan (dónde está secretaría, la biblioteca, el aula 2.3) y dar clase en los laboratorios y las instalaciones desde el campus virtual. Esta guía explica qué debe tener, cómo se organiza el trabajo entre servicios, dónde se aloja y cómo se conecta con Moodle o Canvas, con un plan por fases para que no se quede en la web de comunicación como una foto bonita.

## Tres públicos, un solo tour

El error habitual es hacer un tour «de marketing»: la fachada, el césped, la biblioteca vacía. Se publica, se enlaza desde la web y nadie vuelve. La alternativa es diseñar el recorrido para tres usos y que cada uno tenga su entrada:

| Público | Qué busca | Qué necesita el tour |
|---|---|---|
| **Futuro alumnado** | Cómo es el sitio, las aulas, la residencia, la ciudad | Un itinerario guiado (Autopilot) por lo mejor del campus, en los idiomas de los mercados a los que se recluta |
| **Alumnado nuevo** | Dónde está cada cosa | Plano por edificio y por planta, mapa geográfico, menú de escenas agrupado por edificio y hotspots de navegación en cada puerta |
| **Profesorado** | Enseñar en el laboratorio, el taller o el archivo sin llevar al grupo | Escenas de los espacios docentes con contenido y preguntas, lanzadas desde el campus virtual |

Con Andarama las tres entradas son el mismo `tour.json`: los itinerarios de Autopilot, las áreas con plano y nivel, el modo mapa sobre OpenStreetMap y los quiz están en el mismo editor, y se documentan en [el lienzo del tour](https://docs.andarama.com/usuario/grafo/).

## Estructura: edificios, plantas y mapa

Un campus es grande, así que la estructura importa:

- **Áreas**: cada edificio es un área; cada planta, una zona dentro del área con su plano y su nivel (−1, 0, 1…). El visitante ve el selector de plantas en el minimapa.
- **Mapa**: las escenas exteriores se colocan sobre OpenStreetMap y el visor muestra un mapa geográfico con la posición.
- **Pasos entre edificios**: se dibujan en ámbar en el grafo; conviene que salgan de las puertas reales y entren mirando hacia delante («seguir el camino»).
- **Escena inicial** por uso: la portada del tour para captación puede ser la plaza central; el enlace de acogida puede abrirse directamente en la escena de secretaría con un enlace profundo (`#s=secretaria`).

## Contenido que merece la pena

- **Navegación limpia** con etiquetas cortas: «Biblioteca», «Aula 2.3», «Cafetería».
- **Texto** breve por espacio: horarios, a quién preguntar, enlace a la web del servicio.
- **Vídeo** de un minuto proyectado sobre una pared en los espacios clave (el decano en el hall, un estudiante en la residencia).
- **Etiquetas flotantes** para señalizar sin abrir paneles.
- **Formulario** de contacto anclado en la escena de admisiones, con anti-spam.
- **Quiz** en los espacios docentes: la práctica de laboratorio, la visita al archivo, la seguridad en el taller.
- **Idiomas**: el selector aparece solo en cuanto hay traducciones; se traducen escenas y hotspots, y el CSV se puede mandar a la agencia.
- **Versión accesible** en texto, que Andarama genera de cada tour, para cumplir con la accesibilidad de las webs públicas.

## Fotografía: cómo organizarla

Un campus mediano (cinco edificios, sesenta puntos de vista) se fotografía en dos o tres jornadas con una cámara 360 de gama media en un monópode, preferiblemente con las aulas vacías y buena luz. Algunas recomendaciones que ahorran repeticiones:

- Nombrar las fotos por edificio y planta ya en la cámara, o renombrarlas por patrón en el [importador](https://docs.andarama.com/usuario/importador/) (`Edificio A, planta 1 ({n})`).
- Colocar cada foto sobre el plano en el propio importador, con un clic por foto, antes de crear las escenas.
- Fotografiar también los recorridos entre edificios (dos o tres puntos por camino): son los que orientan a quien llega.
- Guardar los originales: las fotos se reutilizan cuando cambie una sala.

## Quién lo hace: organización y roles

Lo que funciona es que **comunicación coordina, cada facultad edita lo suyo e informática decide el alojamiento**. Andarama lo permite con organizaciones y roles (administrador, editor, colaborador, lector), presencia y bloqueo por escena para que dos personas editen el mismo tour sin pisarse, comentarios anclados a las escenas y versiones con restauración. En una instalación propia, el profesorado entra con su cuenta institucional por SSO (OIDC) y las altas se hacen solas por dominio de correo. Todo esto está en [primeros pasos](https://docs.andarama.com/usuario/primeros-pasos/) y en la página de [universidades](/universidades/).

## Dónde se aloja

Dos caminos, y los dos son la misma aplicación:

- **Instancia propia**. El servicio de informática despliega Andarama con Docker o en una cuenta de Cloudflare de la universidad (cabe en la capa gratuita para usos medios). Sin planes ni cuotas; los datos, en la infraestructura de la institución. Es la opción natural para una universidad pública con RGPD y un DPD que preguntará dónde están los datos. Se puede contratar soporte, actualizaciones y acompañamiento.
- **Alojado en andarama.com**. Sin nada que mantener; el plan Formación (99 $ al mes o 990 $ al año) incluye 100 recorridos, SCORM, marca blanca, dominio propio (`tour.universidad.es`), equipo y factura en euros bajo pedido para instituciones. El SSO por OIDC es solo de la instancia propia.

En ambos casos el tour se exporta como paquete estático y el formato está documentado: si dentro de diez años cambia todo, el recorrido sigue abriéndose.

## Integración con el campus virtual

Los espacios docentes del tour se suben a Moodle, Canvas o Blackboard como paquete **SCORM** 1.2 o 2004, que informa al campus de la finalización y la puntuación de los quiz. La integración por **LTI 1.3** está en pruebas y disponible bajo petición. Lo explicamos paso a paso en [cómo meter un recorrido 360 en Moodle](/blog/recorrido-360-moodle/).

## Datos y privacidad

La analítica de Andarama cuenta visitas, escenas y hotspots agregados, sin cookies ni direcciones IP, así que el tour no necesita banner de consentimiento. Para captación es suficiente saber qué escenas ven los visitantes y cuánto tiempo se quedan; para docencia, el informe del quiz lo da el propio tour.

## Plan por fases

| Fase | Qué | Cuándo |
|---|---|---|
| 1 | Un edificio piloto (la facultad más motivada): fotos, plano, navegación, textos, un idioma | Un mes |
| 2 | El campus completo para acogida: todos los edificios, plantas y mapa; enlaces profundos desde la web de cada servicio | Antes de septiembre |
| 3 | Itinerario de captación con Autopilot, vídeo y los idiomas de reclutamiento; embebido en la web de admisiones | Antes de la campaña |
| 4 | Espacios docentes con quiz, subidos como SCORM al campus virtual | Con el profesorado interesado, uno a uno |

El piloto se prueba con la cuenta de catorce días o con el [ejecutable de escritorio](https://docs.andarama.com/despliegue/escritorio/) en un portátil; el despliegue institucional viene después, con lo aprendido. Si queréis que os acompañemos, el formulario de la [página de universidades](/universidades/) prepara el correo.
