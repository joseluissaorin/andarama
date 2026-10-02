/**
 * Plantilla «Búsqueda del tesoro: máquinas y oficios» (Tecnología, Primaria y
 * ESO; también salidas de museo). Cuatro panorámicas CC0 de Poly Haven con
 * máquinas, un garaje, edificios industriales y un museo de aviación al aire libre.
 *
 * Mecánica: once tesoros con pista, el marcador arriba («Encontrados N de
 * M»), el botón de pista, mensaje al encontrarlos todos y, en la primera
 * escena, un tesoro con compuerta (no se sale sin encontrarlo) para enseñar
 * esa opción. Cada pista nombra solo cosas que se ven en la foto.
 */
const PH = "https://commons.wikimedia.org/wiki/File:";
const nav = (target, label, extra = {}) => ({ type: "navigation", content: { target: `@scene:${target}`, label, altText: label, entry: { mode: "forward" } }, ...extra });
const t = (at, label, reward, hint, extra = {}) => ({
  type: "treasure",
  at,
  content: { label, altText: `Tesoro: ${label.toLowerCase()}`, reward, hint, once: true, ...extra },
});

export default {
  slug: "busqueda-del-tesoro-maquinas-y-oficios",
  lang: "es",
  langs: ["es"],
  title: "Búsqueda del tesoro: máquinas y oficios",
  description:
    "Una búsqueda del tesoro para Tecnología o para preparar una salida: un museo de aviación, un garaje con taller, una fábrica de ladrillos y una estación de bombeo. Hay que encontrar once objetos escondidos con ayuda de las pistas. Las fotografías son de lugares distintos, con licencia CC0 (Poly Haven).",
  start: "aviones",
  creditsAt: [0.97, 0.55],
  creditsNote:
    "Las cuatro fotografías son de lugares distintos y tienen licencia CC0 (Poly Haven): se pueden reutilizar sin pedir permiso.",
  scenes: [
    {
      key: "aviones",
      commonsPage: `${PH}Aviation_museum_-_Panorama_(Sergej_Majboroda_via_Poly_Haven).jpg`,
      author: "Sergej Majboroda (Poly Haven)",
      title: "1. El museo de aviación",
      alt: "Museo de aviación al aire libre: caminos de cemento entre el césped, un avión de hélices blanco y rojo, un caza de camuflaje con el número 05, un avión de pasajeros con escalerilla y muchos aviones al fondo",
      desc: "Un museo de aviación al aire libre. Hay aviones de hélice, cazas y aviones de pasajeros.",
      look: [0.5, 0.48],
      hotspots: [
        {
          type: "text",
          at: [0.6, 0.6],
          content: {
            label: "Cómo se juega",
            altText: "Cómo se juega",
            title: "Cómo se juega",
            body:
              "En estos cuatro lugares hay **once tesoros escondidos**. Cuando encuentres uno, púlsalo.\n\n- Arriba verás cuántos llevas.\n- Si te atascas, pulsa **Pista**: te dice qué buscar en la escena donde estás.\n- En esta primera escena hay un tesoro que tienes que encontrar antes de poder seguir.",
          },
          style: { icon: { name: "help-circle" }, pulse: true },
        },
        t([0.81, 0.46], "Hélice", "**¡Una hélice de cuatro palas!** Gira y empuja el aire hacia atrás para que el avión avance.", "Busca un avión de pasajeros con motores de hélice, a la derecha.", { gate: true }),
        t([0.06, 0.47], "Morro rojo", "**El morro rojo de un avión de hélices.** En el morro suelen ir el radar y la cabina de los pilotos.", "A la izquierda hay un avión blanco con la parte de delante pintada de rojo."),
        t([0.33, 0.49], "Caza 05", "**Un caza con camuflaje.** Los colores verde y arena lo hacían difícil de ver desde el aire.", "Busca un avión pintado de manchas con un número rojo."),
        nav("garaje", "Ir al garaje del taller", { at: [0.6, 0.52] }),
      ],
    },
    {
      key: "garaje",
      commonsPage: `${PH}Garage_–_Panorama_(Greg_Zaal_via_Poly_Haven).jpg`,
      author: "Greg Zaal (Poly Haven)",
      title: "2. El garaje del taller",
      alt: "Garaje con paredes naranjas, dos portones de madera, un saco de boxeo colgado del techo, una escalera de mano, neumáticos, un cortacésped rojo y estanterías llenas de botes y herramientas",
      desc: "Un garaje que también hace de taller: herramientas, botes de pintura y alguna máquina.",
      look: [0.6, 0.47],
      hotspots: [
        t([0.77, 0.53], "Cortacésped", "**¡Un cortacésped!** Una cuchilla gira muy deprisa bajo la carcasa y corta la hierba a la misma altura.", "Busca una máquina roja con ruedas junto a los neumáticos."),
        t([0.69, 0.48], "Escalera de mano", "**Una escalera de mano** de madera, apoyada en la pared para llegar a lo alto.", "Algo de madera, alto y con peldaños, descansa contra la pared del fondo a la derecha."),
        t([0.44, 0.35], "Saco de boxeo", "**Un saco de boxeo** colgado de una viga: este garaje también es gimnasio.", "Mira hacia arriba: algo negro cuelga del techo delante de los portones."),
        nav("aviones", "Volver al museo de aviación", { at: [0.36, 0.52] }),
        nav("ladrillos", "Ir a la fábrica de ladrillos", { at: [0.57, 0.5] }),
      ],
    },
    {
      key: "ladrillos",
      commonsPage: `${PH}Brick_factory_02_-_Panorama_(Sergej_Majboroda_via_Poly_Haven).jpg`,
      author: "Sergej Majboroda (Poly Haven)",
      title: "3. La fábrica de ladrillos",
      alt: "Patio de tierra de una fábrica de ladrillos con grandes pilas de ladrillos rojos envueltos en plástico, una chimenea de ladrillo al fondo y árboles alrededor",
      desc: "El patio de una fábrica de ladrillos, con los ladrillos apilados y listos para salir.",
      look: [0.4, 0.47],
      hotspots: [
        t([0.165, 0.42], "Chimenea", "**La chimenea del horno.** Los ladrillos se cuecen en hornos muy calientes y el humo sale por la chimenea.", "Al fondo, a la izquierda, asoma algo alto y de ladrillo."),
        t([0.42, 0.47], "Pilas de ladrillos", "**Miles de ladrillos de arcilla cocida**, envueltos en plástico para protegerlos de la lluvia.", "Algo rojo, apilado y envuelto en plástico ocupa casi toda la escena."),
        t([0.77, 0.32], "Abeto", "**Un abeto**, el único árbol en forma de cono de este patio.", "Entre los árboles de la derecha hay uno con forma de punta."),
        nav("garaje", "Volver al garaje", { at: [0.6, 0.53] }),
        nav("bombeo", "Ir a la estación de bombeo", { at: [0.95, 0.56] }),
      ],
    },
    {
      key: "bombeo",
      commonsPage: `${PH}Pump_station_–_Panorama_(Sergej_Majboroda_via_Poly_Haven).jpg`,
      author: "Sergej Majboroda (Poly Haven)",
      title: "4. La estación de bombeo",
      alt: "Estación de bombeo en el campo: un depósito de agua cilíndrico y oxidado sobre un montículo, tuberías, casetas de metal, postes de la luz y un contenedor con una escalera",
      desc: "Una estación de bombeo de agua en el campo, con depósitos oxidados y casetas.",
      look: [0.5, 0.45],
      hotspots: [
        t([0.09, 0.38], "Depósito de agua", "**¡El depósito elevado!** Al estar en alto, el agua baja por las tuberías con fuerza gracias a la gravedad.", "Busca un cilindro alto y oxidado subido a un montículo."),
        t([0.89, 0.53], "Escalera", "**Una escalera de metal** para subir al contenedor.", "A la derecha, un contenedor grande tiene algo para subir."),
        nav("ladrillos", "Volver a la fábrica de ladrillos", { at: [0.6, 0.56] }),
      ],
    },
  ],
  settings: {
    intro: "fade",
    transition: { kind: "fade", duration: 700 },
    treasureHunt: { enabled: true, title: "Máquinas y oficios", completionMessage: "¡Has encontrado los once tesoros! Eres un gran observador." },
    ui: {
      welcome: {
        enabled: true,
        title: "Máquinas y oficios",
        body: "Recorre un museo de aviación, un garaje con taller, una fábrica de ladrillos y una estación de bombeo. Hay once tesoros escondidos: encuéntralos todos. Si te atascas, pulsa Pista.",
        startLabel: "Empezar a buscar",
        showControls: true,
      },
    },
  },
};
