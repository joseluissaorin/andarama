# Encargos de tours de monumentos (Wikimedia Commons)

Doce encargos listos para montar con `node tooling/commons/montar-monumento.mjs tooling/commons/encargos/{slug}.json`.
Cada uno lleva los textos escritos (título, descripción, título, `alt` y `desc` de cada escena), las panorámicas elegidas mirándolas una a una, las coordenadas y las fuentes (`_fuentes`) de las que salen los hechos. `ejemplo-poly-haven.json` es el encargo de prueba y no forma parte de la galería.

| Lugar | Slug | Idioma | Escenas | Licencias | Demanda medida (búsquedas/mes) | Fuente de los hechos |
|---|---|---|---|---|---|---|
| Notre-Dame (París, Laon y Dijon) | `notre-dame` | fr | 3 | CC BY-SA 2.0, 3.0, 4.0 | 900 (fr-FR 480, en 360) | Wikipedia fr: Cathédrale Notre-Dame de Paris, Cathédrale Notre-Dame de Laon, Église Notre-Dame de Dijon |
| Smithsonian Institution (Washington) | `smithsonian` | en | 4 | CC BY 4.0, CC BY-SA 4.0 | 780 (en-US 730) | Wikipedia en: Smithsonian Institution, Smithsonian Institution Building, National Air and Space Museum, National Mall |
| Marte (cuatro cráteres, HiRISE) | `mars` | en | 4 | CC BY 2.0, dominio público (NASA) | 120 (en 100) | Wikipedia en: Mars, HiRISE, Arabia Terra; ficha de Commons de cada imagen |
| Cataratas del Niágara | `niagara-falls` | en | 3 | CC BY 4.0 | 60 (en 50) | Wikipedia en: Niagara Falls, Horseshoe Falls, American Falls, Luna Island, Prospect Point Observation Tower |
| Wiener Konzerthaus (Viena) | `konzerthaus-wien` | de | 5 | CC BY-SA 4.0 | por sondear | Wikipedia de: Wiener Konzerthaus |
| Augustusplatz (Leipzig) | `augustusplatz-leipzig` | de | 5 | CC BY-SA 4.0 | por sondear | Wikipedia de: Augustusplatz, Gewandhaus (Leipzig), Opernhaus (Leipzig), City-Hochhaus Leipzig, Brunnen in Leipzig, Lichtfest Leipzig, Paulinum |
| Yoshinogari (Saga, Japón) | `yoshinogari` | ja | 6 | CC0 | por sondear | Wikipedia ja: 吉野ヶ里遺跡; Wikipedia en: Yoshinogari site |
| Isabella Plantation (Richmond Park, Londres) | `isabella-plantation` | en | 3 | CC BY-SA 3.0 | por sondear | Wikipedia en: Isabella Plantation, Richmond Park |
| Barrage de Malpasset (Fréjus) | `barrage-de-malpasset` | fr | 4 | CC BY-SA 3.0 | por sondear | Wikipedia fr: Barrage de Malpasset; Wikipedia en: Malpasset Dam |
| Parque del Retiro (Madrid) | `parque-del-retiro` | es | 3 | CC BY 4.0 | por sondear | Wikipedia es: Parque del Retiro de Madrid, Monumento a Alfonso XII, Palacio de Velázquez, Fuente del Ángel Caído |
| Quedlinburg (Sajonia-Anhalt) | `quedlinburg` | de | 5 | CC BY-SA 3.0, 4.0 | por sondear | Wikipedia de: Quedlinburg, Gänsehirtenturm, St. Nikolai (Quedlinburg), St. Wiperti (Quedlinburg), Münzenberg (Quedlinburg) |
| Bletterbachschlucht (Tirol del Sur) | `bletterbach` | de | 5 | CC0 | por sondear | Wikipedia de: Bletterbach; Wikipedia en: Bletterbach |

La demanda medida viene de la sonda de monumentos del 14-09-2026 (`docs/seo/ESTUDIO-RESULTADOS.md`, §9); «por sondear» significa que el lugar no estaba en esa sonda y hay que medirlo por lotes antes de invertir más (§9.1).

## Criterios de selección

- Solo panorámicas esféricas completas (equirectangulares 2:1, ≥ 4000 px) con licencia CC0, CC BY o CC BY-SA, comprobadas una a una en miniatura.
- De 3 a 6 escenas por lugar, ordenadas como recorrido (exterior → entrada → interior, o de arriba abajo en la garganta).
- Sin cementerios, sin interiores privados, sin personas identificables en primer plano; las figuras de Yoshinogari son maniquíes.
- Hechos (qué es, dónde está, de cuándo, por qué importa) tomados del artículo de Wikipedia enlazado en `_fuentes`; coordenadas del artículo o del GPS de Commons.
- Idioma: el del mercado con más demanda (fr para Notre-Dame, en para Smithsonian, Marte y Niágara) o el del país.

## Descartes y dudas (también en `_notas` de cada encargo)

- **Notre-Dame**: Commons solo tiene una esférica de Notre-Dame de Paris (exterior, nocturna, 2007); el tour se completa con Laon y Dijon, y el título lo dice. Descartadas Neuchâtel y Ménilmontant.
- **Konzerthaus Wien**: el «Konzerthaus» de Poly Haven (CC0, 16 384 px) es el de Berlín; fuera. No hay exterior libre del vienés.
- **Basilica San Nicola (Bari)**: las tres imágenes son proyecciones «little planet», no equirectangulares; descartado el lugar.
- **Parlamento Europeo (Bruselas)**: solo dos ficheros únicos (los seis del listado eran duplicados); descartado.
- **Carnegie Mellon, Bass Harbor Head Light, Haus der Kulturen der Welt, Kashveti**: uno o dos ficheros; descartados.
- **Kungliga Myntkabinettet**: reunión con personas identificables; descartado.
- **Ryusendo**: iluminación de colores saturados, dos de tres ilegibles; descartado.
- **Wissensturm (Linz)**: interiores de aulas y pasillos sin interés visual; descartado.
- **Podmoskovnaya, Tumanyan**: idiomas (ru, hy) sin etiquetas en el montador; descartados.
- **Mauthausen**: memorial de campo de concentración; fuera por el mismo criterio que los cementerios.
- **Niágara**: turistas en las tres escenas (inevitables allí); se quitó la más cercana y repetida.
- **Marte**: son proyecciones de modelos de terreno HiRISE, no fotos de superficie; `placeCountry` US por el origen de los datos (NASA), sin lat/lng.
- Alternativas viables si hacen falta más lugares: Braunschweig (Burgplatz y Altstadt, CC BY-SA 4.0, 15 panorámicas), Jagdschloss Grunewald (Berlín, 37), Lenbachhaus (Múnich, 10), Magpupungko (Filipinas, CC0, 4).
