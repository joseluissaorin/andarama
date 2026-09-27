/**
 * Plantilla «Campus: jornada de puertas abiertas» (universidades, FP,
 * colegios). Siete panorámicas de StrangeTraveler (CC BY 4.0) del campus del
 * Arsakeio en Psychikó (Atenas), con pantalla de bienvenida, mapa, recorrido
 * automático para la pantalla del vestíbulo, formulario de contacto para
 * futuros alumnos y traducción al inglés.
 *
 * Hechos: Wikipedia en, «Arsakeio» (consultada el 27-9-2026). Es una
 * demostración: no habla en nombre del centro.
 */
const C = "https://commons.wikimedia.org/wiki/File:";
const F = (n) => `${C}Arsakeia_Schools_in_Psychiko_(01-09-2017)_(${n}).jpg`;
const nav = (target, label, at) => ({ type: "navigation", at, content: { target: `@scene:${target}`, label, altText: label, entry: { mode: "forward" } } });
const cartela = (at, label, title, body) => ({ type: "text", at, content: { label, altText: label, title, body }, style: { icon: { name: "info" } } });

export default {
  slug: "campus-puertas-abiertas-arsakeio",
  lang: "es",
  langs: ["es", "en"],
  title: { es: "Campus: jornada de puertas abiertas en el Arsakeio (Atenas)", en: "Campus: open day at the Arsakeio (Athens)" },
  description: {
    es: "Recorrido de puertas abiertas por el campus del Arsakeio en Psychikó (Atenas): el edificio principal, el edificio neoclásico, las pistas deportivas, el huerto escolar, la sala de colecciones y un aula de infantil. Con mapa, recorrido automático para la pantalla del vestíbulo y formulario para pedir información. Demostración de Andarama con fotografías de StrangeTraveler (CC BY 4.0) en Wikimedia Commons.",
    en: "An open-day tour of the Arsakeio campus in Psychiko (Athens): the main building, the neoclassical building, the sports grounds, the school garden, the collections room and a nursery classroom. With a map, an automatic tour for the lobby screen and an enquiry form. An Andarama demo with photographs by StrangeTraveler (CC BY 4.0) on Wikimedia Commons.",
  },
  start: "principal",
  creditsAt: [0.05, 0.62],
  creditsNote: {
    es: "Recorrido de demostración de Andarama; no es una publicación del Arsakeio ni de la Filekpedeftikí Etería. Los datos proceden de Wikipedia («Arsakeio»).",
    en: "Andarama demo tour; not a publication of the Arsakeio or the Philekpaideutiki Etaireia. Facts from Wikipedia (“Arsakeio”).",
  },
  scenes: [
    {
      key: "principal",
      commonsPage: F("01"),
      title: { es: "Edificio principal", en: "Main building" },
      alt: {
        es: "Gran edificio curvo de color arena con columnata y escalinata; en la fachada, las inscripciones «ΦΙΛΕΚΠΑΙΔΕΥΤΙΚΗ ΕΤΑΙΡΕΙΑ» y «ΑΡΣΑΚΕΙΟΝ»",
        en: "Large curved sand-coloured building with a colonnade and a flight of steps; on the facade, the inscriptions “ΦΙΛΕΚΠΑΙΔΕΥΤΙΚΗ ΕΤΑΙΡΕΙΑ” and “ΑΡΣΑΚΕΙΟΝ”",
      },
      desc: { es: "La fachada curva del edificio principal, con su columnata.", en: "The curved facade of the main building, with its colonnade." },
      look: [0.3, 0.4],
      map: { lat: 38.015954, lng: 23.777372 },
      hotspots: [
        cartela(
          [0.3, 0.3],
          { es: "El Arsakeio", en: "The Arsakeio" },
          { es: "Bienvenidos al Arsakeio", en: "Welcome to the Arsakeio" },
          {
            es: "En la fachada se lee «Filekpedeftikí Etería» (Sociedad de Amigos de la Educación) y «Arsakeion». La sociedad se fundó en 1836 y abrió una escuela para niñas en el centro de Atenas; lleva el nombre de Apóstolos Arsakis, que la financió. El campus de Psychikó abrió en 1933 y los colegios admiten también a chicos desde 1982.",
            en: "The facade reads “Philekpaideutiki Etaireia” (Society of the Friends of Education) and “Arsakeion”. The society was founded in 1836 and opened a school for girls in central Athens; it is named after Apostolos Arsakis, who endowed it. The Psychiko campus opened in 1933, and the schools have also admitted boys since 1982.",
          },
        ),
        {
          type: "form",
          at: [0.3, 0.52],
          content: {
            label: { es: "Pide información", en: "Ask for information" },
            altText: { es: "Formulario para pedir información", en: "Enquiry form" },
            title: { es: "¿Quieres saber más?", en: "Want to know more?" },
            fields: [
              { id: "nombre", type: "text", label: { es: "Nombre", en: "Name" }, required: true },
              { id: "email", type: "email", label: { es: "Correo electrónico", en: "Email" }, required: true },
              {
                id: "etapa",
                type: "select",
                label: { es: "Etapa que te interesa", en: "Stage you are interested in" },
                options: [
                  { value: "infantil", label: { es: "Infantil", en: "Nursery" } },
                  { value: "primaria", label: { es: "Primaria", en: "Primary" } },
                  { value: "secundaria", label: { es: "Secundaria y bachillerato", en: "Secondary" } },
                ],
              },
              { id: "mensaje", type: "textarea", label: { es: "Tu pregunta", en: "Your question" } },
              { id: "acepto", type: "checkbox", label: { es: "Acepto que me escriban para responder a mi consulta", en: "I agree to be contacted about my enquiry" }, required: true },
            ],
            destination: { api: true },
            turnstile: true,
            once: true,
            submitLabel: { es: "Enviar", en: "Send" },
            successMessage: { es: "Gracias. Te escribiremos pronto.", en: "Thank you. We will be in touch soon." },
          },
          style: { icon: { name: "mail" }, pulse: true },
        },
        nav("neoclasico", { es: "Al edificio neoclásico", en: "To the neoclassical building" }, [0.75, 0.56]),
      ],
    },
    {
      key: "neoclasico",
      commonsPage: F("07"),
      title: { es: "Edificio neoclásico", en: "Neoclassical building" },
      alt: {
        es: "Edificio neoclásico de color crema con escalinata y pórtico, entre setos, palmeras y pinos; a la derecha, un camino hacia otros edificios",
        en: "Cream neoclassical building with a flight of steps and a portico, among hedges, palm trees and pines; on the right, a path to other buildings",
      },
      desc: { es: "Un edificio neoclásico entre setos y palmeras.", en: "A neoclassical building among hedges and palm trees." },
      look: [0.3, 0.45],
      hotspots: [
        cartela(
          [0.3, 0.42],
          { es: "Los colegios", en: "The schools" },
          { es: "De infantil al bachillerato", en: "From nursery to upper secondary" },
          {
            es: "En Psychikó conviven varias escuelas de primaria, de secundaria (gymnasio) y de bachillerato (lykeio). El Arsakeio tiene también campus en Ekali, Salónica, Patras, Ioánina y Tirana, con más de 9000 alumnos en total.",
            en: "Several primary schools, lower secondary schools (gymnasio) and upper secondary schools (lykeio) share the Psychiko campus. The Arsakeio also has campuses in Ekali, Thessaloniki, Patras, Ioannina and Tirana, with more than 9,000 students in total.",
          },
        ),
        nav("canchas", { es: "A las pistas deportivas", en: "To the sports courts" }, [0.82, 0.56]),
        nav("principal", { es: "Volver al edificio principal", en: "Back to the main building" }, [0.05, 0.6]),
      ],
    },
    {
      key: "canchas",
      commonsPage: F("12"),
      title: { es: "Pistas de baloncesto", en: "Basketball courts" },
      alt: {
        es: "Pistas de baloncesto verdes y rojas al aire libre, con canastas, junto a un pabellón blanco y edificios de aulas de tres plantas",
        en: "Green and red outdoor basketball courts with hoops, next to a white sports hall and three-storey classroom buildings",
      },
      desc: { es: "Pistas al aire libre junto al pabellón y los edificios de aulas.", en: "Outdoor courts next to the sports hall and classroom buildings." },
      look: [0.6, 0.47],
      hotspots: [
        nav("pista", { es: "A la pista de atletismo", en: "To the running track" }, [0.1, 0.56]),
        nav("neoclasico", { es: "Volver al edificio neoclásico", en: "Back to the neoclassical building" }, [0.9, 0.56]),
      ],
    },
    {
      key: "pista",
      commonsPage: F("10"),
      title: { es: "Pista de atletismo", en: "Running track" },
      alt: {
        es: "Pista de atletismo roja con calles blancas que rodea un campo de césped, con porterías, una red alta y pistas de juego al fondo",
        en: "Red running track with white lanes around a grass field, with goals, a tall net and play courts in the background",
      },
      desc: { es: "La pista de atletismo y el campo de césped.", en: "The running track and the grass field." },
      look: [0.5, 0.5],
      hotspots: [
        nav("huerto", { es: "Al huerto escolar", en: "To the school garden" }, [0.75, 0.56]),
        nav("canchas", { es: "Volver a las pistas de baloncesto", en: "Back to the basketball courts" }, [0.35, 0.56]),
      ],
    },
    {
      key: "huerto",
      commonsPage: F("06"),
      title: { es: "Huerto escolar", en: "School garden" },
      alt: {
        es: "Huerto con bancales de hortalizas entre caminos de grava, un espantapájaros con ropa de colores y árboles alrededor",
        en: "Garden with vegetable beds between gravel paths, a scarecrow in colourful clothes and trees around",
      },
      desc: { es: "Bancales de hortalizas y un espantapájaros.", en: "Vegetable beds and a scarecrow." },
      look: [0.45, 0.55],
      hotspots: [
        { type: "tooltip", at: [0.4, 0.45], content: { text: { es: "Un espantapájaros vigila los bancales.", en: "A scarecrow watches over the beds." }, label: { es: "Espantapájaros", en: "Scarecrow" }, altText: { es: "Espantapájaros", en: "Scarecrow" } } },
        nav("coleccion", { es: "A la sala de colecciones", en: "To the collections room" }, [0.5, 0.62]),
        nav("pista", { es: "Volver a la pista", en: "Back to the track" }, [0.95, 0.6]),
      ],
    },
    {
      key: "coleccion",
      commonsPage: F("05"),
      title: { es: "Sala de colecciones", en: "Collections room" },
      alt: {
        es: "Sala de suelo de mármol con vitrinas de madera a lo largo de las paredes, cuadros enmarcados, una pantalla de proyección y otra sala con vitrinas al fondo",
        en: "Marble-floored room with wooden display cases along the walls, framed pictures, a projection screen and another room with cases beyond",
      },
      desc: { es: "Vitrinas a lo largo de las paredes y una pantalla para proyectar.", en: "Display cases along the walls and a projection screen." },
      look: [0.3, 0.5],
      hotspots: [
        { type: "tooltip", at: [0.3, 0.57], content: { text: { es: "Vitrinas con colecciones para las clases.", en: "Display cases with collections for lessons." }, label: { es: "Vitrinas", en: "Display cases" }, altText: { es: "Vitrinas", en: "Display cases" } } },
        nav("aula", { es: "Al aula de infantil", en: "To the nursery classroom" }, [0.55, 0.55]),
        nav("huerto", { es: "Volver al huerto", en: "Back to the garden" }, [0.95, 0.6]),
      ],
    },
    {
      key: "aula",
      commonsPage: F("04"),
      title: { es: "Aula de infantil", en: "Nursery classroom" },
      alt: {
        es: "Aula de infantil luminosa con mesas y sillas pequeñas de color amarillo pálido, bancos, estanterías con juegos y dibujos de los niños en las paredes",
        en: "Bright nursery classroom with small pale yellow tables and chairs, benches, shelves with games and children’s drawings on the walls",
      },
      desc: { es: "Mesas y sillas pequeñas, juegos y dibujos en las paredes.", en: "Small tables and chairs, games and drawings on the walls." },
      look: [0.5, 0.55],
      hotspots: [nav("principal", { es: "Volver al edificio principal", en: "Back to the main building" }, [0.95, 0.58])],
    },
  ],
  settings: {
    intro: "littlePlanet",
    transition: { kind: "fade", duration: 800 },
    autorotate: { enabled: true, speed: 0.05, delay: 10 },
    geoMap: { enabled: true, zoom: 16 },
    autopilot: [
      {
        id: "vestibulo",
        title: { es: "Recorrido para la pantalla del vestíbulo", en: "Lobby screen tour" },
        loop: true,
        resumeAfter: 30,
        steps: ["principal", "neoclasico", "canchas", "pista", "huerto", "coleccion", "aula"].map((k) => ({ scene: `@scene:${k}`, dwell: 5, rotate: 1.8 })),
      },
    ],
    ui: {
      autopilotButton: true,
      langSelector: true,
      welcome: {
        enabled: true,
        title: { es: "Jornada de puertas abiertas", en: "Open day" },
        body: {
          es: "Recorre el campus a tu ritmo o activa la visita automática. Si te queda alguna duda, deja tu pregunta en el formulario del edificio principal.",
          en: "Explore the campus at your own pace or start the automatic tour. If you have any questions, leave them in the form at the main building.",
        },
        startLabel: { es: "Empezar el recorrido", en: "Start the tour" },
        showControls: true,
      },
    },
  },
};
