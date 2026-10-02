---
title: Primeros pasos
description: Crear una cuenta, los roles del equipo, el primer tour, la barra lateral del Studio, los idiomas y los atajos.
---

## Crear una cuenta

Abre `/studio/` en tu instancia y pulsa **Crear cuenta**. El primer usuario registrado se convierte automáticamente en administrador de la instancia. Según la política configurada, el registro puede ser abierto, por invitación o limitado a dominios institucionales; si la instancia tiene SSO institucional (OIDC), usa **Entrar con SSO**.

En [app.andarama.com](https://app.andarama.com) la cuenta la gestiona Clerk (correo con código, contraseña o passkey) y para crear recorridos hace falta un plan o la prueba gratuita de 14 días, sin tarjeta; en el [ejecutable de escritorio](/docs/despliegue/escritorio/) y en cualquier instalación propia no hay planes ni cuotas de plan.

Cada cuenta pertenece a una o varias **organizaciones**. Los roles por organización son:

| Rol | Puede |
|---|---|
| Administrador | Todo, incluidas las personas del equipo y la configuración de la organización |
| Editor | Crear, editar y publicar cualquier recorrido de la organización |
| Colaborador | Editar solo los recorridos que crea o que le comparten, sin publicar |
| Lector | Ver los recorridos de la organización sin poder cambiarlos |

Las personas y sus roles se gestionan en la página **Equipo** de la barra
lateral; para dejar a alguien trabajar en un único recorrido está el botón
**Personas** del editor. El trabajo en equipo está en todos los planes. Véase
[Trabajar en equipo](/docs/usuario/equipo/).

## Crear el primer tour

1. En **Proyectos**, pulsa **Nuevo tour** y ponle título (opcionalmente carpeta o plantilla). En andarama.com, el bloque **Empieza con una plantilla** ofrece recorridos de muestra por sector, entre ellos los del grupo **Educación**: un escape room, un quiz evaluable y una búsqueda del tesoro (véase [Docencia](/docs/usuario/docencia/#empezar-con-una-plantilla)).
2. Sube panoramas equirectangulares (2:1) en **Biblioteca de medios** o directamente desde el editor.
3. Añade escenas eligiendo cada panorama.
4. Coloca hotspots haciendo clic sobre el panorama.
5. Pulsa **Publicar**: obtendrás una URL pública `/t/tu-slug`, código QR y código de embebido. Véase [Publicar y compartir](/docs/usuario/publicar/).

## Novedades, problemas y versión

Al pie de la barra lateral del Studio hay tres cosas pequeñas que conviene
conocer:

- **Novedades**: lo último que ha cambiado, fechado. Un punto avisa cuando hay
  entradas que todavía no has leído.
- **Informar de un problema**: un formulario para contar qué ha pasado, con
  una captura de pantalla opcional (PNG, JPEG, WebP o GIF de hasta 5 MB). Se
  adjuntan solos la dirección, el proyecto, la escena, el navegador y la
  versión del Studio, así que no hace falta explicarlos.
- **La versión** del Studio, en letra pequeña. Si escribes para pedir ayuda,
  cítala: dice exactamente qué versión tienes delante.

## Instalar el Studio como aplicación

El Studio es una aplicación instalable. En Chrome, Edge y Android aparece
**Instalar la aplicación** en la barra lateral (o el icono de instalar de la
barra de direcciones). En iPad y iPhone se añade desde Safari: **Compartir →
Añadir a pantalla de inicio**.

Instalada se abre en su propia ventana, sin barra del navegador, y arranca al
instante aunque la red vaya mal. Los datos nunca se sirven de una copia local:
lo que se guarda es el armazón de la aplicación, nunca las respuestas de la
API, para que no puedas ver un tour de hace dos horas creyendo que es el de
ahora. Cuando hay una versión nueva avisa en la barra lateral y se aplica al
pulsar, no por sorpresa mientras editas.

## Idiomas

El Studio habla 32 idiomas, los mismos que las apps móviles: alemán, árabe,
checo, chino simplificado y tradicional, coreano, croata, danés, eslovaco,
español, filipino, finés, francés, griego, hebreo, húngaro, indonesio, inglés,
italiano, japonés, malayo, neerlandés, noruego, polaco, portugués, rumano,
ruso, sueco, tailandés, turco, ucraniano y vietnamita.

Al entrar toma el idioma del navegador; si no está entre esos 32, inglés. Se
cambia desde el selector de la barra lateral o en **Cuenta › Preferencias**,
donde cada idioma aparece con su nombre en su propia lengua. La elección se
guarda en la cuenta, así que viaja contigo a cualquier dispositivo. En árabe y
hebreo la interfaz se dispone de derecha a izquierda.

El visor habla los mismos idiomas: sus botones, avisos y ayudas salen en el
idioma del tour (el idioma por defecto del tour o el que el visitante elija en
su selector). Si el tour está en un idioma para el que no hay traducción de la
interfaz, se usa el del navegador del visitante. Los diccionarios se descargan
solo cuando hacen falta, así que ningún idioma pesa en la carga inicial.

Los textos del propio tour (títulos, descripciones, hotspots) son otra cosa:
se traducen desde el editor, en la vista **Traducciones**, a los idiomas que
tú decidas para cada tour.

## Atajos de teclado del Studio

- `Ctrl/Cmd + K`: paleta de comandos
- `Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z`: deshacer / rehacer
- `Ctrl/Cmd + S`: forzar guardado (el guardado automático actúa igualmente)

## Controles del visor

Ratón (arrastrar, rueda, doble clic), táctil (1 dedo, pellizco), teclado (flechas, `+`/`-`, `Tab` por hotspots, `Enter`, `Esc`), giroscopio en móviles y **modo VR** con gafas: en unas Meta Quest, Pico, Vive o Vision Pro basta con abrir la dirección del tour en el navegador de las gafas y pulsar **Modo VR**; las manos aparecen dentro del tour y accionan los hotspots con la pinza (véase la [guía de realidad virtual](/docs/usuario/realidad-virtual/)).

## En el móvil

El dique de botones se puede **plegar** con la doble flecha: en pantallas
pequeñas empieza plegado y deja la escena limpia, y la decisión se recuerda.
Las **miniaturas de escena** también se pueden quitar y poner desde el propio
visor, independientemente de lo que traiga configurado el tour.
