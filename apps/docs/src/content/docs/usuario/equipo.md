---
title: Trabajar en equipo
description: La página Equipo, qué puede hacer cada rol, cómo invitar a alguien, cómo compartir un solo recorrido con el botón Personas y cómo editar varias personas a la vez, en directo.
---

Los recorridos pertenecen a una **organización**, no a una persona. Todas las
personas de la organización ven sus recorridos y, según su rol, los editan y
publican. En andarama.com, el trabajo en equipo está en **todos los planes**,
también en la prueba gratuita; en una instalación propia no tiene ningún
límite.

## La página Equipo

En la barra lateral del Studio, **Equipo** muestra quién trabaja en la
organización y con qué rol. Desde ahí, quien **administra** la organización:

- invita a personas nuevas,
- cambia el rol de cada una con su desplegable,
- y quita a alguien del equipo con el botón de la papelera.

Las demás personas ven la lista, pero no pueden cambiarla.

## Los roles

Hay cuatro, de más a menos permisos:

| Rol | Puede |
|---|---|
| **Administrador** | Todo, incluidas las personas del equipo y la configuración de la organización |
| **Editor** | Crear, editar y publicar cualquier recorrido de la organización |
| **Colaborador** | Editar solo los recorridos que crea o que le comparten, sin publicar |
| **Lector** | Ver los recorridos de la organización sin poder cambiarlos |

En andarama.com, la cuota de recorridos y de espacio de la organización la fija
el plan de quien la creó: las personas invitadas no necesitan plan propio para
editar.

## Invitar a alguien

1. Abre **Equipo** en la barra lateral.
2. En **Invitar a alguien**, escribe el correo de la persona y elige su
   **rol**.
3. Pulsa **Invitar**.

- Si esa persona **ya tiene cuenta** en Andarama, entra en el equipo en el
  acto.
- Si **no la tiene**, recibe un correo con un enlace para unirse, válido
  durante 14 días, y entra al aceptarlo con esa misma dirección. Mientras
  tanto aparece en la lista como **Invitación pendiente**. Si la instancia no
  tiene el correo configurado (algo habitual en una instalación propia), el
  Studio copia el enlace al portapapeles para que se lo mandes tú.

No confundas esta página con **Ajustes de la organización**: ahí se fijan los
valores por defecto que heredan los recorridos nuevos, no las personas.

## Compartir un solo recorrido: el botón Personas

A veces no quieres meter a alguien en todo el equipo, sino dejarle trabajar en
un recorrido concreto: una compañera de otro departamento, quien hace las
fotos, un alumno en prácticas. Para eso está el botón **Personas** (el icono
de dos personas) de la barra superior del editor.

1. Abre el recorrido y pulsa **Personas**.
2. Escribe el correo, elige el rol y pulsa **Añadir**.

Los roles de un recorrido compartido son tres:

| Rol | Puede, en ese recorrido |
|---|---|
| **Editor** | Editar, publicar y decidir con quién se comparte |
| **Colaborador** | Editar el contenido, sin publicar |
| **Lector** | Verlo sin poder cambiarlo |

Detalles que conviene saber:

- La persona tiene que **tener ya cuenta** en Andarama. Si no la tiene, el
  diálogo lo dice y ofrece **Invitar al equipo**: cuando acepte la invitación,
  ya podrás compartirle el recorrido.
- Quien está en el equipo ya tiene acceso según su rol de organización; si
  además se le comparte el recorrido, vale el mayor de los dos.
- Pueden añadir o quitar personas quienes administran la organización, quien
  creó el recorrido (si es editor) y quien lo tiene compartido como editor.

## Varias personas a la vez

Varias personas pueden tener abierto el mismo recorrido y editarlo al mismo
tiempo, como en un documento compartido. Pueden hacerlo quienes tienen
permiso para editarlo: los colaboradores, editores y administradores del
equipo y las personas con quienes se ha compartido como colaborador o editor.

- **Quién está.** En la cabecera del editor sale una burbuja por persona, con
  sus iniciales y un color propio. Al pasar por encima dice en qué escena o
  pestaña está, y al pulsarla te lleva allí. En la lista de escenas, cada
  escena muestra también las burbujas de quienes están en ella.
- **Dónde mira.** En el panorama ves un anillo del color de cada persona donde
  está mirando y, si mueve el ratón por la escena, una flecha con su nombre.
- **Los cambios llegan solos.** Lo que hace cada uno (crear, mover, editar o
  borrar escenas y puntos, los pasos entre escenas, el orden y los ajustes del
  recorrido) aparece en las pantallas de los demás sin recargar.
- **Nadie pisa a nadie.** Si alguien tiene abierto el panel de una escena o de
  un punto, los demás ven **«Lo está editando…»** con su nombre, y en sus
  pantallas esos campos quedan en solo lectura mientras lo tenga abierto. En
  la lista de escenas, un **candado** de su color marca la escena. El aviso no
  es un cerrojo: **Editar igualmente** lo salta si hace falta.

Si dos personas guardan cambios en el mismo elemento casi a la vez, Andarama
no deja que uno borre al otro: trae lo que guardó la otra persona, lo junta con
lo que estás escribiendo y vuelve a guardar. Si las dos cambiaron exactamente
el mismo campo, se queda lo de quien lo escribía en ese momento; si una de las
dos borró el elemento, el borrado gana y la otra recibe un aviso.

Si se corta la conexión en directo (una wifi que cambia, un portátil que se
duerme), la cabecera muestra un aviso discreto: **«Sin conexión en directo;
los cambios se guardan igualmente»**. Mientras dura no ves a los demás, pero lo
tuyo se sigue guardando; al volver, el editor se pone al día solo.

:::note[En una instalación propia]
La edición en grupo funciona igual en una instalación propia (Docker o Node) y
en el ejecutable de escritorio. Si pones Andarama detrás de un proxy, este
tiene que dejar pasar WebSocket en `/rt/`; está explicado en
[Servidor propio](/docs/despliegue/servidor-propio/).
:::

Para coordinaros sin salir del editor, usad los
[comentarios del equipo](/docs/usuario/comentarios/); y si algo se tuerce, la
pestaña **Versiones** permite volver a una instantánea anterior.
