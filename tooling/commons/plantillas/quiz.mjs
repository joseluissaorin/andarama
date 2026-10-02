/**
 * Plantilla «Quiz evaluable: los árboles y las estaciones» (Ciencias de la
 * Naturaleza, Primaria y primer ciclo de ESO). Cinco panorámicas CC0 de Poly
 * Haven; cada pregunta trata de algo que se ve en la foto.
 *
 * Mecánica: ocho preguntas de opción única con un punto cada una, la primera
 * con compuerta (enseña cómo se bloquea el paso hasta acertar), nota mínima
 * del 60 %, informe final y certificado. El docente cambia las preguntas en
 * el Studio y la nota viaja a Moodle por LTI 1.3 o en el paquete SCORM.
 */
const PH = "https://commons.wikimedia.org/wiki/File:";
const nav = (target, label, extra = {}) => ({ type: "navigation", content: { target: `@scene:${target}`, label, altText: label, entry: { mode: "forward" } }, ...extra });
const q = (at, label, question, options, feedbackCorrect, feedbackWrong, extra = {}) => ({
  type: "quiz",
  at,
  content: { label, altText: label, question, kind: "single", options, feedbackCorrect, feedbackWrong, points: 1, ...extra },
  style: { pulse: true },
});

export default {
  slug: "quiz-arboles-y-estaciones",
  lang: "es",
  langs: ["es"],
  title: "Quiz evaluable: los árboles y las estaciones",
  description:
    "Un cuestionario con nota para Ciencias de la Naturaleza: cinco lugares con árboles y plantas, ocho preguntas sobre lo que se ve, nota mínima del 60 % y certificado al terminar. Sirve de modelo para cualquier asignatura: cambia las preguntas, conserva la mecánica. Las fotografías son de lugares distintos, con licencia CC0 (Poly Haven).",
  start: "otono",
  creditsAt: [0.95, 0.55],
  creditsNote:
    "Las cinco fotografías son de lugares distintos y tienen licencia CC0 (Poly Haven): se pueden reutilizar sin pedir permiso.",
  scenes: [
    {
      key: "otono",
      commonsPage: `${PH}Autumn_forest_01_–_Panorama_(Andreas_Mischok_via_Poly_Haven).jpg`,
      author: "Andreas Mischok (Poly Haven)",
      title: "1. Un bosque en otoño",
      alt: "Bosque de árboles altos y delgados con hojas amarillas y verdes, el suelo cubierto de hojas secas y una gran roca en el centro",
      desc: "Un bosque de hoja caduca en otoño. Mira el suelo, las copas y la roca del centro.",
      look: [0.5, 0.45],
      hotspots: [
        {
          type: "text",
          at: [0.42, 0.55],
          content: {
            label: "Cómo funciona",
            altText: "Cómo funciona",
            title: "Cómo funciona",
            body:
              "En cada lugar hay preguntas sobre lo que se ve. **Mira bien alrededor antes de responder**: arrastra la imagen o mueve el móvil.\n\n- Cada pregunta vale un punto.\n- La primera hay que acertarla para poder seguir.\n- Al final verás tu nota. Con un 60 % o más, consigues el certificado.",
          },
          style: { icon: { name: "help-circle" }, pulse: true },
        },
        q(
          [0.3, 0.62],
          "Pregunta 1",
          "¿Por qué el suelo de este bosque está cubierto de hojas amarillas y marrones?",
          [
            { id: "a", text: "Porque son árboles de hoja caduca y en otoño pierden las hojas", correct: true },
            { id: "b", text: "Porque ha habido un incendio" },
            { id: "c", text: "Porque las hojas solo caen en verano" },
          ],
          "Exacto: los árboles de hoja caduca se desprenden de las hojas en otoño para ahorrar agua y energía durante el invierno.",
          "No es eso. Fíjate en el color de las hojas que aún quedan en las copas.",
          { gate: true },
        ),
        q(
          [0.56, 0.36],
          "Pregunta 2",
          "La gran roca del centro tiene manchas verdes. ¿Qué crece sobre ella?",
          [
            { id: "a", text: "Musgo", correct: true },
            { id: "b", text: "Hierba de pradera" },
            { id: "c", text: "Algas de mar" },
          ],
          "Muy bien: el musgo crece sobre rocas y troncos en lugares húmedos y con sombra.",
          "Casi. Piensa en una planta pequeña que no necesita tierra y le gusta la humedad.",
        ),
        nav("invierno", "Ir a la arboleda", { at: [0.13, 0.55] }),
      ],
    },
    {
      key: "invierno",
      commonsPage: `${PH}Forest_grove_-_Panorama_(Dimitrios_Savva_and_Jarod_Guest_via_Poly_Haven).jpg`,
      author: "Dimitrios Savva y Jarod Guest (Poly Haven)",
      title: "2. Una arboleda sin hojas",
      alt: "Arboleda de troncos delgados y ramas desnudas, sin hojas, con el suelo de hierba corta y hojas secas y el sol bajo entre los troncos",
      desc: "Casi todos los árboles están sin hojas. Solo unas pocas ramas empiezan a verdear.",
      look: [0.55, 0.45],
      hotspots: [
        q(
          [0.45, 0.58],
          "Pregunta 3",
          "¿En qué época del año es más probable que se tomara esta foto?",
          [
            { id: "a", text: "A finales del invierno o al comienzo de la primavera", correct: true },
            { id: "b", text: "En pleno verano" },
            { id: "c", text: "En otoño, con las copas llenas de hojas" },
          ],
          "Eso es: las ramas están desnudas y apenas asoman las primeras hojas.",
          "Mira las ramas: ¿tienen hojas?",
        ),
        q(
          [0.82, 0.55],
          "Pregunta 4",
          "Sin hojas, el árbol casi no puede hacer la fotosíntesis. ¿Qué la hace posible cuando las hojas vuelven?",
          [
            { id: "a", text: "La luz del sol, el agua y el dióxido de carbono del aire", correct: true },
            { id: "b", text: "Solo el agua de la lluvia" },
            { id: "c", text: "El calor de la tierra" },
          ],
          "Correcto: con luz, agua y dióxido de carbono, la hoja fabrica su alimento y libera oxígeno.",
          "Falta algo. La fotosíntesis necesita luz, agua y un gas del aire.",
        ),
        nav("otono", "Volver al bosque en otoño", { at: [0.25, 0.56] }),
        nav("ficus", "Ir al parque del ficus", { at: [0.62, 0.56] }),
      ],
    },
    {
      key: "ficus",
      commonsPage: `${PH}Old_tree_in_city_park_–_Panorama_(Andreas_Mischok_via_Poly_Haven).jpg`,
      author: "Andreas Mischok (Poly Haven)",
      title: "3. Un ficus en un parque de la ciudad",
      alt: "Enormes ficus con troncos retorcidos y cordones que cuelgan de las ramas hasta el suelo; al fondo, una verja y edificios de la ciudad",
      desc: "Unos ficus enormes en un parque. De sus ramas cuelgan cordones que llegan hasta el suelo.",
      look: [0.5, 0.42],
      hotspots: [
        q(
          [0.3, 0.45],
          "Pregunta 5",
          "¿Qué son los cordones que cuelgan de las ramas y llegan hasta el suelo?",
          [
            { id: "a", text: "Raíces aéreas del propio árbol", correct: true },
            { id: "b", text: "Lianas de otra planta" },
            { id: "c", text: "Cables de la iluminación del parque" },
          ],
          "¡Muy bien! Son raíces aéreas: bajan desde las ramas y, al tocar el suelo, se hacen gruesas como troncos y sujetan el árbol.",
          "No. Mira cómo algunos cordones ya se han hecho gruesos al llegar al suelo.",
        ),
        q(
          [0.7, 0.4],
          "Pregunta 6",
          "Mira las copas. ¿Este árbol es de hoja perenne o de hoja caduca?",
          [
            { id: "a", text: "De hoja perenne: conserva hojas verdes todo el año", correct: true },
            { id: "b", text: "De hoja caduca: pierde todas las hojas en otoño" },
          ],
          "Eso es: el ficus es de hoja perenne. Las hojas viejas caen poco a poco, pero la copa nunca se queda desnuda.",
          "Fíjate en las copas: aunque haya hojas en el suelo, siguen verdes.",
        ),
        nav("invierno", "Volver a la arboleda", { at: [0.88, 0.58] }),
        nav("estanque", "Ir al jardín del estanque", { at: [0.53, 0.55] }),
      ],
    },
    {
      key: "estanque",
      commonsPage: `${PH}Chinese_garden_–_Panorama_(Andreas_Mischok_via_Poly_Haven).jpg`,
      author: "Andreas Mischok (Poly Haven)",
      title: "4. El estanque de un jardín chino",
      alt: "Jardín de estilo chino con un estanque de agua verde, plantas flotantes con flores rosadas, una linterna de piedra delante, rocas, un pabellón de madera y una pagoda",
      desc: "Un jardín de estilo chino con un estanque. Busca las plantas que flotan en el agua.",
      look: [0.5, 0.55],
      hotspots: [
        q(
          [0.47, 0.6],
          "Pregunta 7",
          "¿Cómo se llaman las plantas que flotan en el estanque, con hojas redondas y flores rosadas?",
          [
            { id: "a", text: "Nenúfares", correct: true },
            { id: "b", text: "Helechos" },
            { id: "c", text: "Cactus" },
          ],
          "Correcto: son nenúfares. Sus hojas flotan y sus raíces están en el fondo del estanque.",
          "No. Busca las hojas redondas que flotan en el agua, a la izquierda de la linterna.",
        ),
        nav("ficus", "Volver al parque del ficus", { at: [0.15, 0.6] }),
        nav("jardin", "Ir al jardín de la casa", { at: [0.86, 0.55] }),
      ],
    },
    {
      key: "jardin",
      commonsPage: `${PH}Studio_garden_–_Panorama_(Sergej_Majboroda_via_Poly_Haven).jpg`,
      author: "Sergej Majboroda (Poly Haven)",
      title: "5. El jardín de una casa",
      alt: "Jardín con césped, una tarima de madera con sillas, macetas y un gran árbol que da sombra; a la derecha, una casa de ladrillo rojo con un banco de madera delante",
      desc: "El último lugar: un jardín con un gran árbol que da sombra a la tarima. Queda una pregunta.",
      look: [0.6, 0.45],
      hotspots: [
        q(
          [0.3, 0.35],
          "Pregunta 8",
          "El gran árbol de la izquierda da sombra a la tarima. ¿Qué parte del árbol fabrica su alimento?",
          [
            { id: "a", text: "Las hojas", correct: true },
            { id: "b", text: "El tronco" },
            { id: "c", text: "Las raíces" },
          ],
          "Exacto: las hojas hacen la fotosíntesis. Las raíces absorben agua y el tronco la lleva hacia arriba.",
          "No es esa. Piensa en qué parte recibe la luz del sol.",
        ),
        nav("estanque", "Volver al estanque", { at: [0.5, 0.56] }),
      ],
    },
  ],
  settings: {
    intro: "fade",
    transition: { kind: "fade", duration: 700 },
    quiz: {
      passingScore: 60,
      attempts: 0,
      finalReport: true,
      certificate: { enabled: true, title: "Certificado: los árboles y las estaciones", signature: "Tu profesora o profesor" },
    },
    ui: {
      welcome: {
        enabled: true,
        title: "Los árboles y las estaciones",
        body: "Vas a visitar cinco lugares con árboles y plantas. En cada uno hay preguntas sobre lo que se ve: mira bien antes de responder. Al final verás tu nota y, si apruebas, tu certificado.",
        startLabel: "Empezar",
        showControls: true,
      },
      final: {
        enabled: true,
        title: "¡Has terminado el recorrido!",
        body: "Ya has respondido a todas las preguntas. Revisa tu nota y descarga el certificado si has aprobado.",
        cta: { label: "Crea tu propio quiz", url: "https://andarama.com/" },
      },
    },
  },
};
