/**
 * Plantilla «Museo: pabellón de caza de Grunewald» (museos, archivos,
 * cabildos). Siete panorámicas de Superbass y Raimond Spekking (CC BY y
 * CC BY-SA 4.0) del Jagdschloss Grunewald de Berlín, con cartelas en tres
 * idiomas (es, en, de) y un recorrido automático para el quiosco.
 *
 * Hechos: Wikipedia de y en, «Jagdschloss Grunewald» (consultadas el
 * 27-9-2026). Las cartelas describen lo que se ve; lo que no se puede
 * comprobar en la foto (qué obra concreta es) se cuenta de la colección, no
 * de la pieza.
 */
const C = "https://commons.wikimedia.org/wiki/File:";
const nav = (target, label, at) => ({ type: "navigation", at, content: { target: `@scene:${target}`, label, altText: label, entry: { mode: "forward" } } });
const cartela = (at, label, title, body) => ({ type: "text", at, content: { label, altText: label, title, body }, style: { icon: { name: "info" } } });

export default {
  slug: "museo-jagdschloss-grunewald",
  lang: "es",
  langs: ["es", "en", "de"],
  title: {
    es: "Museo: pabellón de caza de Grunewald (Berlín)",
    en: "Museum: Grunewald Hunting Lodge (Berlin)",
    de: "Museum: Jagdschloss Grunewald (Berlin)",
  },
  description: {
    es: "Visita virtual del pabellón de caza de Grunewald, el palacio más antiguo que se conserva en Berlín (1542–1543), a orillas del lago Grunewaldsee. Del aire al patio, la Gran Sala renacentista, la escalera, las salas de pintura y el antiguo almacén de caza. Cartelas en español, inglés y alemán y recorrido automático para pantallas. Fotografías de Superbass y Raimond Spekking en Wikimedia Commons (CC BY y CC BY-SA 4.0).",
    en: "A virtual visit to Grunewald Hunting Lodge, the oldest surviving palace in Berlin (1542–1543), on the shore of the Grunewaldsee. From the air to the courtyard, the Renaissance hall, the staircase, the picture galleries and the former hunting store. Labels in Spanish, English and German, with an automatic tour for screens. Photographs by Superbass and Raimond Spekking on Wikimedia Commons (CC BY and CC BY-SA 4.0).",
    de: "Virtueller Rundgang durch das Jagdschloss Grunewald, das älteste erhaltene Schloss Berlins (1542–1543), am Ufer des Grunewaldsees. Aus der Luft in den Hof, in die Große Hofstube, über die Treppe in die Gemäldesäle und ins ehemalige Jagdzeugmagazin. Texte auf Spanisch, Englisch und Deutsch, mit automatischem Rundgang für Bildschirme. Fotos von Superbass und Raimond Spekking auf Wikimedia Commons (CC BY und CC BY-SA 4.0).",
  },
  start: "aire",
  creditsAt: [0.95, 0.55],
  creditsNote: {
    es: "Recorrido de demostración de Andarama; no es una publicación oficial del museo. Los datos proceden de Wikipedia («Jagdschloss Grunewald»).",
    en: "Andarama demo tour; not an official publication of the museum. Facts from Wikipedia (“Jagdschloss Grunewald”).",
    de: "Demo-Rundgang von Andarama, keine offizielle Veröffentlichung des Museums. Angaben nach Wikipedia („Jagdschloss Grunewald“).",
  },
  scenes: [
    {
      key: "aire",
      commonsPage: `${C}2019-06-21-360_Luft_Jagdschloss_Grunewald-0348.jpg`,
      title: { es: "Vista aérea", en: "Aerial view", de: "Luftansicht" },
      alt: {
        es: "Vista aérea del pabellón de caza de Grunewald, con tejados rojos, rodeado de bosque y entre dos brazos del lago Grunewaldsee",
        en: "Aerial view of Grunewald Hunting Lodge, with red roofs, surrounded by forest between two arms of the Grunewaldsee",
        de: "Luftansicht des Jagdschlosses Grunewald mit roten Dächern, umgeben von Wald zwischen zwei Armen des Grunewaldsees",
      },
      desc: {
        es: "El pabellón, a orillas del lago Grunewaldsee y rodeado por el bosque al que dio nombre.",
        en: "The lodge on the shore of the Grunewaldsee, surrounded by the forest it gave its name to.",
        de: "Das Schloss am Ufer des Grunewaldsees, umgeben von dem Wald, dem es seinen Namen gab.",
      },
      look: [0.45, 0.66],
      map: { lat: 52.4675, lng: 13.2611 },
      hotspots: [
        cartela(
          [0.45, 0.72],
          { es: "El pabellón", en: "The lodge", de: "Das Schloss" },
          { es: "Pabellón de caza de Grunewald", en: "Grunewald Hunting Lodge", de: "Jagdschloss Grunewald" },
          {
            es: "Lo mandó construir en 1542–1543 el príncipe elector Joaquín II de Brandeburgo, en estilo renacentista, y es el palacio más antiguo que se conserva en Berlín. Se llamó *Zum grünen Wald* («Al bosque verde»), nombre que acabó dando al bosque entero: Grunewald.\n\nEntre 1705 y 1708, con Federico I, primer rey de Prusia, el arquitecto Martin Grünberg le dio su aspecto barroco. Desde 1932 es un museo de la Fundación de Palacios y Jardines Prusianos.",
            en: "Built in 1542–1543 for Joachim II Hector, Elector of Brandenburg, in the Renaissance style, it is the oldest surviving palace in Berlin. It was called *Zum grünen Wald* (“to the green forest”), a name that passed to the whole forest: Grunewald.\n\nBetween 1705 and 1708, under Frederick I, the first King in Prussia, the master builder Martin Grünberg gave it its Baroque appearance. Since 1932 it has been a museum of the Prussian Palaces and Gardens Foundation.",
            de: "Kurfürst Joachim II. von Brandenburg ließ es 1542–1543 im Stil der Renaissance errichten; es ist das älteste erhaltene Schloss Berlins. Es hieß *Zum grünen Wald*, ein Name, der auf den ganzen Forst überging: Grunewald.\n\nZwischen 1705 und 1708 erhielt es unter Friedrich I., dem ersten König in Preußen, durch den Baumeister Martin Grünberg sein barockes Aussehen. Seit 1932 ist es ein Museum der Stiftung Preußische Schlösser und Gärten.",
          },
        ),
        nav("patio", { es: "Bajar al patio", en: "Down to the courtyard", de: "Hinunter in den Hof" }, [0.45, 0.8]),
      ],
    },
    {
      key: "patio",
      commonsPage: `${C}2018-09-22_Glam_on_Tour_Jagdschloss_Grunewald_360_2.jpg`,
      title: { es: "El patio y la entrada", en: "Courtyard and entrance", de: "Hof und Eingang" },
      alt: {
        es: "Patio empedrado a la sombra de dos grandes árboles, frente a la entrada del pabellón, con una placa de piedra labrada sobre la puerta",
        en: "Cobbled courtyard shaded by two large trees, in front of the lodge entrance, with a carved stone panel above the door",
        de: "Gepflasterter Hof im Schatten zweier großer Bäume vor dem Eingang des Schlosses, mit einer gemeißelten Steintafel über der Tür",
      },
      desc: {
        es: "El patio empedrado y el cuerpo de entrada, con su puerta de madera y la placa de piedra labrada encima.",
        en: "The cobbled courtyard and the entrance block, with its wooden door and the carved stone panel above.",
        de: "Der gepflasterte Hof und der Eingangsbau mit Holztür und gemeißelter Steintafel darüber.",
      },
      look: [0.5, 0.45],
      map: { lat: 52.4672, lng: 13.2614 },
      hotspots: [
        cartela(
          [0.5, 0.39],
          { es: "La entrada", en: "The entrance", de: "Der Eingang" },
          { es: "El cuerpo de entrada", en: "The entrance block", de: "Der Eingangsbau" },
          {
            es: "El pabellón tuvo en origen una torre de escalera octogonal en la fachada, y alrededor del patio se levantaban edificios auxiliares: la casa del guarda, la cocina y un almacén para los útiles de caza. De las reformas del siglo XVIII salió el edificio actual, de tres plantas; el cuerpo de entrada que sobresale de la fachada se conservó.",
            en: "The lodge originally had an octagonal stair tower on its front, and around the courtyard stood outbuildings: the castellan’s house, the kitchen and a store for hunting equipment. The 18th-century alterations produced today’s three-storey building; the projecting entrance block was kept.",
            de: "Das Schloss hatte ursprünglich einen achteckigen Treppenturm an der Vorderfront; um den Hof standen Nebengebäude mit Kastellanswohnung, Küche und einem Raum für das Jagdzeug. Die Umbauten des 18. Jahrhunderts ergaben den heutigen dreigeschossigen Bau; der vorspringende Eingangsbau blieb erhalten.",
          },
        ),
        nav("hofstube", { es: "Entrar", en: "Go inside", de: "Hineingehen" }, [0.5, 0.55]),
        nav("aire", { es: "Ver desde el aire", en: "View from the air", de: "Aus der Luft sehen" }, [0.02, 0.4]),
      ],
    },
    {
      key: "hofstube",
      commonsPage: `${C}2018-09-22-Jagdschloss_Grunewald_360-0010733.jpg`,
      title: { es: "La Gran Sala (Große Hofstube)", en: "The Great Hall (Große Hofstube)", de: "Große Hofstube" },
      alt: {
        es: "Sala con techo de casetones pintados en blanco y negro, una doble arcada sobre una columna central, suelo de baldosas rojas, vitrinas y una chimenea al fondo a la derecha",
        en: "Hall with a ceiling of black-and-white painted coffers, a double arcade on a central column, red tiled floor, display cases and a fireplace at the back on the right",
        de: "Saal mit schwarz-weiß bemalter Kassettendecke, Doppelarkade auf einer Mittelsäule, roten Bodenfliesen, Vitrinen und einem Kamin hinten rechts",
      },
      desc: {
        es: "La sala mayor de la casa y la única que conserva un aire renacentista.",
        en: "The largest room of the house and the only one that keeps a Renaissance feel.",
        de: "Der größte Raum des Hauses und der einzige, der etwa den Renaissancestil vermittelt.",
      },
      look: [0.42, 0.45],
      hotspots: [
        cartela(
          [0.42, 0.5],
          { es: "La columna", en: "The column", de: "Die Säule" },
          { es: "La Gran Sala", en: "The Great Hall", de: "Die Große Hofstube" },
          {
            es: "Es la sala más grande de la casa, y está en la planta baja, algo poco habitual en la época: los salones de fiesta solían estar arriba. En el siglo XVIII se partió en dos con un tabique. Al quitarlo, en los años setenta, apareció esta doble arcada con una columna, y bajo el techo de yeso de 1705, la pintura en blanco y negro que imita un artesonado. También se recuperó el suelo de baldosas rojas.",
            en: "It is the largest room in the house, and it is on the ground floor, which was unusual at the time: banqueting halls were normally upstairs. In the 18th century it was divided in two by a partition. When that was removed in the 1970s, this double arcade with a column came to light, and under the 1705 plaster ceiling, the black-and-white painting imitating a coffered ceiling. The red tiled floor was restored too.",
            de: "Der größte Raum des Hauses liegt im Erdgeschoss, was für die Bauzeit ungewöhnlich war: Festsäle befanden sich meist im Obergeschoss. Im 18. Jahrhundert wurde er durch eine Trennwand geteilt. Bei ihrem Abbruch in den 1970er-Jahren kam diese Doppelarkade mit einer Säule zum Vorschein, und unter der Stuckdecke von 1705 die schwarz-weiße Bemalung, die eine Kassettendecke nachahmt. Auch der rote Ziegelboden wurde wiederhergestellt.",
          },
        ),
        cartela(
          [0.6, 0.12],
          { es: "El techo", en: "The ceiling", de: "Die Decke" },
          { es: "Un artesonado pintado", en: "A painted coffered ceiling", de: "Eine gemalte Kassettendecke" },
          {
            es: "Los casetones no son de madera: están pintados en blanco y negro sobre el techo liso. Estuvieron ocultos bajo un techo de yeso desde 1705 hasta la restauración.",
            en: "The coffers are not carved in wood: they are painted in black and white on the flat ceiling. They were hidden under a plaster ceiling from 1705 until the restoration.",
            de: "Die Kassetten sind nicht aus Holz, sondern schwarz-weiß auf die glatte Decke gemalt. Von 1705 bis zur Restaurierung lagen sie unter einer Stuckdecke verborgen.",
          },
        ),
        nav("escalera", { es: "A la escalera", en: "To the staircase", de: "Zur Treppe" }, [0.855, 0.52]),
        nav("patio", { es: "Volver al patio", en: "Back to the courtyard", de: "Zurück in den Hof" }, [0.02, 0.52]),
      ],
    },
    {
      key: "escalera",
      commonsPage: `${C}2018-09-22_Glam_on_Tour_Jagdschloss_Grunewald_360_1.jpg`,
      author: "Superbass",
      title: { es: "La escalera de caracol", en: "The spiral staircase", de: "Die Wendeltreppe" },
      alt: {
        es: "Escalera de caracol de piedra con muros encalados y un ventanuco, entre dos puertas en arco que dan a salas con suelo rojo",
        en: "Stone spiral staircase with whitewashed walls and a small window, between two arched doorways leading to rooms with red floors",
        de: "Steinerne Wendeltreppe mit weiß gekalkten Wänden und einem kleinen Fenster, zwischen zwei Rundbogentüren zu Räumen mit rotem Boden",
      },
      desc: {
        es: "Una escalera de caracol de piedra lleva a las plantas altas.",
        en: "A stone spiral staircase leads to the upper floors.",
        de: "Eine steinerne Wendeltreppe führt in die oberen Geschosse.",
      },
      look: [0.3, 0.55],
      hotspots: [
        cartela(
          [0.35, 0.62],
          { es: "La escalera", en: "The staircase", de: "Die Treppe" },
          { es: "Subir en espiral", en: "Climbing in a spiral", de: "In der Spirale nach oben" },
          {
            es: "En tiempos de Joaquín II, las habitaciones privadas de la pareja electoral estaban en la primera planta y se subía a ellas por el *Wendelstein*, la torre de escalera de la fachada. Aún hoy se sube por escaleras de caracol de piedra como esta.",
            en: "In Joachim II’s time the Elector and Electress had their private rooms on the first floor, reached by the *Wendelstein*, the stair tower on the front. Stone spiral stairs like this one are still the way up.",
            de: "Zur Zeit Joachims II. lagen die Privatgemächer des Kurfürstenpaares im ersten Obergeschoss, erreichbar über den *Wendelstein* an der Vorderfront. Noch heute führen steinerne Wendeltreppen wie diese nach oben.",
          },
        ),
        nav("sala-roja", { es: "A las salas de pintura", en: "To the picture galleries", de: "Zu den Gemäldesälen" }, [0.36, 0.42]),
        nav("hofstube", { es: "Volver a la Gran Sala", en: "Back to the Great Hall", de: "Zurück zur Großen Hofstube" }, [0.95, 0.55]),
      ],
    },
    {
      key: "sala-roja",
      commonsPage: `${C}2018-09-22-Jagdschloss_Grunewald_360-0010769.jpg`,
      title: { es: "Sala roja: la Pasión", en: "Red gallery: the Passion", de: "Roter Saal: die Passion" },
      alt: {
        es: "Sala de paredes rojas y suelo de madera con grandes tablas pintadas del siglo XVI en marcos dorados, un ventanal y un banco",
        en: "Gallery with red walls and a wooden floor, large 16th-century painted panels in gilt frames, a tall window and a bench",
        de: "Saal mit roten Wänden und Holzboden, großen Tafelgemälden des 16. Jahrhunderts in Goldrahmen, einem hohen Fenster und einer Bank",
      },
      desc: {
        es: "Grandes tablas con escenas de la Pasión sobre paredes rojas.",
        en: "Large panels with scenes of the Passion on red walls.",
        de: "Große Tafeln mit Passionsszenen an roten Wänden.",
      },
      look: [0.5, 0.47],
      hotspots: [
        cartela(
          [0.5, 0.45],
          { es: "Las tablas", en: "The panels", de: "Die Tafeln" },
          { es: "La colección Cranach", en: "The Cranach collection", de: "Die Cranach-Sammlung" },
          {
            es: "Desde 2011 el pabellón expone la mayor colección de Lucas Cranach de Berlín, con unas treinta obras de Cranach el Viejo y de su hijo. Entre ellas, nueve grandes tablas centrales de un ciclo de la Pasión que Joaquín II encargó en 1537–1538 para la iglesia colegial del antiguo convento dominico de Cölln. En esta sala se ven escenas de la Pasión en gran formato.",
            en: "Since 2011 the lodge has shown Berlin’s largest Lucas Cranach collection, some thirty works by Cranach the Elder and his son. Among them are nine large central panels of a Passion cycle that Joachim II commissioned in 1537–1538 for the collegiate church of the former Dominican friary in Cölln. This gallery shows large-format scenes of the Passion.",
            de: "Seit 2011 ist hier Berlins größte Cranach-Sammlung mit rund 30 Werken von Lucas Cranach d. Ä. und seinem Sohn zu sehen. Dazu gehören neun großformatige Mitteltafeln eines Passionszyklus, den Joachim II. 1537/38 für die Stiftskirche des ehemaligen Cöllner Dominikanerklosters beauftragte. In diesem Saal hängen großformatige Passionsszenen.",
          },
        ),
        nav("sala-verde", { es: "A la sala verde", en: "To the green gallery", de: "Zum grünen Saal" }, [0.62, 0.52]),
        nav("escalera", { es: "Volver a la escalera", en: "Back to the staircase", de: "Zurück zur Treppe" }, [0.95, 0.6]),
      ],
    },
    {
      key: "sala-verde",
      commonsPage: `${C}2018-09-22-Jagdschloss_Grunewald_360-0010778.jpg`,
      title: { es: "Sala verde: el retablo", en: "Green gallery: the altarpiece", de: "Grüner Saal: der Altar" },
      alt: {
        es: "Sala de paredes verde grisáceo y suelo rojo con un retablo gótico de tres tablas con la Crucifixión en el centro y cuadros en las paredes",
        en: "Gallery with grey-green walls and a red floor, a Gothic three-panel altarpiece with the Crucifixion in the centre and paintings on the walls",
        de: "Saal mit graugrünen Wänden und rotem Boden, einem gotischen dreiteiligen Altar mit der Kreuzigung in der Mitte und Gemälden an den Wänden",
      },
      desc: {
        es: "Un retablo de tres tablas sobre fondo dorado preside la sala.",
        en: "A three-panel altarpiece on a gold ground dominates the room.",
        de: "Ein dreiteiliger Altar auf Goldgrund beherrscht den Raum.",
      },
      look: [0.5, 0.47],
      hotspots: [
        cartela(
          [0.5, 0.45],
          { es: "El retablo", en: "The altarpiece", de: "Der Altar" },
          { es: "Pintura de los siglos XV al XIX", en: "Painting from the 15th to the 19th century", de: "Malerei des 15. bis 19. Jahrhunderts" },
          {
            es: "Además de Cranach, el museo reúne pintura neerlandesa y alemana de los siglos XV al XIX. La colección incluye un retablo de tres alas de principios del siglo XV, procedente de la iglesia de Cadolzburg, derribada en 1750. Aquí, en el centro, la Crucifixión.",
            en: "Besides Cranach, the museum holds Dutch and German painting from the 15th to the 19th century. The collection includes an early 15th-century three-wing altarpiece from the town church of Cadolzburg, demolished in 1750. Here, in the centre, the Crucifixion.",
            de: "Neben Cranach zeigt das Museum niederländische und deutsche Malerei des 15. bis 19. Jahrhunderts. Zur Sammlung gehört ein dreiflügeliges Altarbild des frühen 15. Jahrhunderts aus der 1750 abgebrochenen Stadtkirche in Cadolzburg. Hier in der Mitte die Kreuzigung.",
          },
        ),
        nav("magazin", { es: "Al almacén de caza", en: "To the hunting store", de: "Zum Jagdzeugmagazin" }, [0.07, 0.55]),
        nav("sala-roja", { es: "Volver a la sala roja", en: "Back to the red gallery", de: "Zurück zum roten Saal" }, [0.31, 0.52]),
      ],
    },
    {
      key: "magazin",
      commonsPage: `${C}2018-09-22-Jagdschloss_Grunewald_360-0010787.jpg`,
      title: { es: "El almacén de caza (Jagdzeugmagazin)", en: "The hunting store (Jagdzeugmagazin)", de: "Das Jagdzeugmagazin" },
      alt: {
        es: "Nave larga con techo de vigas de madera, suelo empedrado, cornamentas de ciervo en la pared, vitrinas iluminadas y paneles de texto",
        en: "Long hall with a timber-beamed ceiling, cobbled floor, deer antlers on the wall, lit display cases and text panels",
        de: "Lange Halle mit Holzbalkendecke, gepflastertem Boden, Hirschgeweihen an der Wand, beleuchteten Vitrinen und Texttafeln",
      },
      desc: {
        es: "El antiguo almacén de útiles de caza, hoy museo de la caza.",
        en: "The former hunting-equipment store, now a hunting museum.",
        de: "Das ehemalige Jagdzeugmagazin, heute ein Jagdmuseum.",
      },
      look: [0.6, 0.47],
      hotspots: [
        cartela(
          [0.6, 0.44],
          { es: "Las cornamentas", en: "The antlers", de: "Die Geweihe" },
          { es: "Del almacén al museo de caza", en: "From store to hunting museum", de: "Vom Magazin zum Jagdmuseum" },
          {
            es: "En 1765 Federico el Grande ordenó guardar aquí el material de caza del Jägerhof de Berlín, y para ello se alargó un antiguo establo del patio. Las armas no se guardaban aquí, sino en las armerías. En esta nave, de 38 metros tras las reformas, abrió el 29 de enero de 1977 un museo de la caza.",
            en: "In 1765 Frederick the Great ordered the hunting equipment of the Berlin Jägerhof to be stored here, and an old stable in the courtyard was lengthened for it. Weapons were not kept here but in the armouries. In this hall, 38 metres long after alterations, a hunting museum opened on 29 January 1977.",
            de: "1765 befahl Friedrich der Große, das Jagdzeug des Berliner Jägerhofes hier zu lagern; dafür wurde ein Stall im Süden des Hofes verlängert. Die Waffen lagen nicht hier, sondern in den Rüst- und Waffenkammern. In der nach Umbauten 38 Meter langen Halle wurde am 29. Januar 1977 ein Jagdmuseum eröffnet.",
          },
        ),
        nav("aire", { es: "Volver al principio", en: "Back to the start", de: "Zurück zum Anfang" }, [0.23, 0.52]),
        nav("sala-verde", { es: "Volver a la sala verde", en: "Back to the green gallery", de: "Zurück zum grünen Saal" }, [0.9, 0.55]),
      ],
    },
  ],
  settings: {
    intro: "littlePlanet",
    transition: { kind: "fade", duration: 900 },
    autorotate: { enabled: true, speed: 0.05, delay: 12 },
    geoMap: { enabled: true, zoom: 15 },
    autopilot: [
      {
        id: "visita",
        title: { es: "Visita automática", en: "Automatic tour", de: "Automatischer Rundgang" },
        loop: true,
        resumeAfter: 30,
        steps: ["aire", "patio", "hofstube", "escalera", "sala-roja", "sala-verde", "magazin"].map((k) => ({ scene: `@scene:${k}`, dwell: 6, rotate: 1.6 })),
      },
    ],
    ui: {
      autopilotButton: true,
      langSelector: true,
      accessibleMode: true,
      welcome: {
        enabled: true,
        title: { es: "Pabellón de caza de Grunewald", en: "Grunewald Hunting Lodge", de: "Jagdschloss Grunewald" },
        body: {
          es: "El palacio más antiguo que se conserva en Berlín. Pulsa los puntos de información para leer las cartelas, o deja que el recorrido automático te lleve sala por sala.",
          en: "The oldest surviving palace in Berlin. Tap the information points to read the labels, or let the automatic tour take you room by room.",
          de: "Das älteste erhaltene Schloss Berlins. Tippen Sie auf die Infopunkte, um die Texte zu lesen, oder lassen Sie sich vom automatischen Rundgang von Raum zu Raum führen.",
        },
        startLabel: { es: "Empezar la visita", en: "Start the visit", de: "Rundgang beginnen" },
        showControls: true,
      },
    },
  },
};
