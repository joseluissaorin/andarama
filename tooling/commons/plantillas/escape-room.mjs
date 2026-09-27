/**
 * Plantilla «Escape room: la bodega del castillo» (aula, colegios, museos con
 * público infantil). Juego inventado sobre cinco panorámicas CC0 de Poly
 * Haven: las pistas nombran solo cosas que se ven en cada foto.
 *
 * Mecánica: una variable («llave») que abre el paso del sótano, tres tesoros
 * con pista, dos preguntas con compuerta en el salón, una última al aire
 * libre, nota mínima, diploma y pantalla final.
 */
const PH = "https://commons.wikimedia.org/wiki/File:";
const nav = (target, label, extra = {}) => ({ type: "navigation", content: { target: `@scene:${target}`, label, altText: label, entry: { mode: "forward" } }, ...extra });

export default {
  slug: "escape-room-bodega-del-castillo",
  lang: "es",
  langs: ["es"],
  title: "Escape room: la bodega del castillo",
  description:
    "Un escape room de cinco salas para jugar en clase o en casa. Te has quedado encerrado en las bodegas de un castillo: busca la llave, encuentra los tres tesoros escondidos y responde a las preguntas del salón para salir al aire libre. Al final hay nota y diploma. La historia es inventada; las fotografías son de lugares reales distintos, con licencia CC0 (Poly Haven).",
  start: "bodega",
  creditsAt: [0.85, 0.62],
  creditsNote:
    "La historia es inventada. Las cinco fotografías son de lugares distintos: la bodega y las ruinas son del castillo de Zavelstein (Selva Negra, Alemania); el sótano de roca, del Drachenfels; el trastero y el salón, de otros edificios. Todas son CC0 (Poly Haven): se pueden reutilizar sin pedir permiso.",
  scenes: [
    {
      key: "bodega",
      commonsPage: `${PH}Castle_zavelstein_cellar_(Andreas_Mischok_via_Poly_Haven).jpg`,
      author: "Andreas Mischok (Poly Haven)",
      title: "1. La bodega abovedada",
      alt: "Bodega con bóveda de piedra rojiza, suelo de losas, un ventanuco con luz y un pasadizo con escalones a la izquierda",
      desc: "Aquí empieza el juego. Solo entra luz por un ventanuco; al fondo, un pasadizo con escalones.",
      look: [0.6, 0.47],
      hotspots: [
        {
          type: "text",
          at: [0.52, 0.55],
          content: {
            label: "Cómo se juega",
            altText: "Cómo se juega",
            title: "Cómo se juega",
            body:
              "Te has quedado encerrado en las bodegas del castillo. Para salir:\n\n1. **Busca la llave** que abre el paso del sótano de roca.\n2. **Encuentra los tres tesoros** escondidos por el camino. Si te atascas, pulsa el botón de pista.\n3. **Responde a las preguntas del salón**: hasta que no aciertes, las puertas no se abren.\n\nMira bien cada sala: las preguntas son sobre lo que se ve.",
          },
          style: { icon: { name: "help-circle" }, pulse: true },
        },
        { type: "tooltip", at: [0.599, 0.4], content: { text: "El ventanuco es demasiado estrecho para salir. Al menos, deja pasar la luz.", label: "Ventanuco", altText: "Ventanuco" } },
        {
          type: "treasure",
          at: [0.117, 0.1],
          content: { label: "Lámpara", altText: "Tesoro: la lámpara del techo", reward: "**¡La vieja lámpara!** Tesoro 1 de 3.", hint: "Mira hacia arriba: alguien colgó una luz del techo de la bóveda.", once: true },
        },
        nav("sotano", "Subir por el pasadizo", { at: [0.128, 0.5] }),
      ],
    },
    {
      key: "sotano",
      commonsPage: `${PH}Drachenfels_cellar_-_Panorama_(Andreas_Mischok_via_Poly_Haven).jpg`,
      author: "Andreas Mischok (Poly Haven)",
      title: "2. El sótano de roca",
      alt: "Sótano excavado en la roca con suelo de tierra, un gran arco luminoso en el centro, una puerta pequeña a la izquierda y un hueco a la derecha",
      desc: "Un sótano excavado en la roca. El gran arco da a la luz, pero hace falta la llave para cruzarlo.",
      look: [0.62, 0.5],
      hotspots: [
        nav("bodega", "Volver a la bodega", { at: [0.096, 0.52] }),
        nav("trastero", "Entrar en el trastero", { at: [0.846, 0.52] }),
        nav("salon", "Cruzar el arco", { at: [0.62, 0.55], conditions: { vars: [{ var: "llave", op: "truthy" }] } }),
        {
          type: "tooltip",
          at: [0.62, 0.55],
          content: { text: "Aún no puedes cruzar: el guardián dejó dicho que solo pasa el arco quien lleva la llave del trastero.", label: "El arco", altText: "El arco, cerrado" },
          conditions: { vars: [{ var: "llave", op: "falsy" }] },
          style: { icon: { name: "lock" } },
        },
        {
          type: "treasure",
          at: [0.591, 0.67],
          content: { label: "Mata verde", altText: "Tesoro: la mata verde del suelo", reward: "**Una planta que crece bajo tierra.** Tesoro 2 de 3.", hint: "Algo verde crece en el suelo, donde llega la luz del arco.", once: true },
        },
      ],
    },
    {
      key: "trastero",
      commonsPage: `${PH}Storeroom_–_Panorama_(Greg_Zaal_via_Poly_Haven).jpg`,
      author: "Greg Zaal (Poly Haven)",
      title: "3. El trastero del guardián",
      alt: "Trastero con estanterías, cajas de cartón, un sillón naranja, un colchón azul apoyado en la pared, un neumático y papeles por el suelo",
      desc: "El trastero del guardián: estanterías, cajas, un sillón, un colchón y un neumático. En algún sitio está la llave.",
      look: [0.5, 0.5],
      hotspots: [
        nav("sotano", "Volver al sótano de roca", { at: [0.3125, 0.55] }),
        {
          type: "text",
          at: [0.66, 0.68],
          content: { label: "Una nota", altText: "Nota del guardián", title: "Nota del guardián", body: "«La llave no está donde se duerme ni donde se sienta, sino en lo más blanco del cuarto.»" },
          style: { icon: { name: "file-text" } },
        },
        {
          type: "state",
          at: [0.565, 0.46],
          content: { label: "Abrir la caja blanca", altText: "Abrir la caja blanca", actions: [{ var: "llave", op: "set", value: true }] },
          conditions: { vars: [{ var: "llave", op: "falsy" }] },
          style: { icon: { name: "box" }, pulse: true },
        },
        {
          type: "text",
          at: [0.565, 0.46],
          content: { label: "La llave", altText: "La llave de hierro", title: "¡La llave!", body: "Dentro de la caja blanca había una **llave de hierro**. Ya puedes cruzar el arco del sótano de roca." },
          conditions: { vars: [{ var: "llave", op: "truthy" }] },
          style: { icon: { name: "key" } },
        },
        {
          type: "treasure",
          at: [0.742, 0.62],
          content: { label: "Neumático", altText: "Tesoro: el neumático", reward: "**Un neumático en un castillo.** Tesoro 3 de 3.", hint: "Algo redondo y negro descansa junto a las cajas de la derecha.", once: true },
        },
      ],
    },
    {
      key: "salon",
      commonsPage: `${PH}Old_hall_–_Panorama_(Sergej_Majboroda_via_Poly_Haven).jpg`,
      author: "Sergej Majboroda (Poly Haven)",
      title: "4. El salón de las preguntas",
      alt: "Gran salón con techo pintado, lámparas de araña, suelo de parqué en espiga, una galería con balaustrada a la izquierda y ventanales en arco a la derecha",
      desc: "Un salón con techo pintado y lámparas de araña. Las puertas no se abren hasta acertar las dos preguntas.",
      look: [0.5, 0.45],
      hotspots: [
        nav("sotano", "Volver al sótano de roca", { at: [0.0625, 0.52] }),
        {
          type: "quiz",
          at: [0.5, 0.5],
          content: {
            label: "Primera pregunta",
            altText: "Primera pregunta",
            question: "En el trastero, ¿qué había apoyado contra la pared, detrás del sillón?",
            kind: "single",
            options: [
              { id: "a", text: "Un colchón azul", correct: true },
              { id: "b", text: "Una escalera de mano" },
              { id: "c", text: "Una bicicleta" },
            ],
            feedbackCorrect: "Exacto: un colchón azul.",
            feedbackWrong: "No era eso. Si no te acuerdas, vuelve al trastero y míralo.",
            points: 1,
            gate: true,
          },
          style: { pulse: true },
        },
        {
          type: "quiz",
          at: [0.76, 0.47],
          content: {
            label: "Segunda pregunta",
            altText: "Segunda pregunta",
            question: "En la primera bodega, ¿por dónde entraba la luz?",
            kind: "single",
            options: [
              { id: "a", text: "Por una trampilla del techo" },
              { id: "b", text: "Por un ventanuco estrecho", correct: true },
              { id: "c", text: "Por una chimenea" },
            ],
            feedbackCorrect: "Así es: por un ventanuco.",
            feedbackWrong: "Casi. Recuerda la primera sala: la luz venía de un hueco de la pared.",
            points: 1,
            gate: true,
          },
          style: { pulse: true },
        },
        nav("salida", "Salir por la puerta del fondo", { at: [0.245, 0.52] }),
      ],
    },
    {
      key: "salida",
      commonsPage: `${PH}Zavelstein_-_Panorama_(Andreas_Mischok_via_Poly_Haven).jpg`,
      author: "Andreas Mischok (Poly Haven)",
      title: "5. Al aire libre",
      alt: "Ruinas del castillo de Zavelstein: muros de piedra rojiza, una torre redonda a la izquierda, un banco de madera y árboles",
      desc: "¡Fuera! Estas son las ruinas del castillo de Zavelstein, en la Selva Negra. Queda una última pregunta.",
      look: [0.44, 0.47],
      hotspots: [
        {
          type: "quiz",
          at: [0.3, 0.42],
          content: {
            label: "Última pregunta",
            altText: "Última pregunta",
            question: "Mira los muros de estas ruinas. ¿De qué están hechos?",
            kind: "single",
            options: [
              { id: "a", text: "De piedra de color rojizo", correct: true },
              { id: "b", text: "De ladrillo pintado de blanco" },
              { id: "c", text: "De madera" },
            ],
            feedbackCorrect: "Eso es: piedra rojiza, como la de las bodegas.",
            feedbackWrong: "Fíjate otra vez en el color de los muros.",
            points: 1,
          },
          style: { pulse: true },
        },
        nav("salon", "Volver al salón", { at: [0.44, 0.52] }),
      ],
    },
  ],
  settings: {
    intro: "fade",
    transition: { kind: "fade", duration: 700 },
    variables: { llave: false },
    treasureHunt: { enabled: true, title: "Tesoros del castillo", completionMessage: "¡Has encontrado los tres tesoros del castillo!" },
    quiz: {
      passingScore: 60,
      attempts: 0,
      finalReport: true,
      certificate: { enabled: true, title: "Diploma de fuga del castillo", signature: "El guardián del castillo" },
    },
    ui: {
      welcome: {
        enabled: true,
        title: "La bodega del castillo",
        body: "Te has quedado encerrado en las bodegas de un castillo. Busca la llave, encuentra los tres tesoros y responde a las preguntas del salón para salir. Empieza por el punto de ayuda de la primera sala.",
        startLabel: "Empezar a jugar",
        showControls: true,
      },
      final: {
        enabled: true,
        title: "¡Has escapado del castillo!",
        body: "Has encontrado la llave, has cruzado el arco y has respondido a las preguntas. Puedes seguir explorando las salas o volver a empezar.",
        cta: { label: "Crea tu propio escape room", url: "https://andarama.com/" },
      },
    },
  },
};
