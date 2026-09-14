#!/usr/bin/env python3
"""Propone encargos de tours de monumentos: cruza el inventario de panorámicas
libres de Wikimedia Commons (docs/seo/datos/commons/inventario.jsonl, que
escribe inventario.py) con la demanda medida por la sonda de monumentos
(docs/seo/monumentos.json y docs/seo/datos/monumentos_{mercado}.json) y escribe
un encargo por lugar con al menos tres panorámicas que coincidan por nombre en
tooling/commons/encargos/{slug}.json, listo para que una persona escriba los
textos (title, description, títulos y textos alternativos de las escenas están
marcados TODO: no se inventa nada sobre los lugares) y lo monte con
montar-monumento.mjs.

Uso: proponer-encargos.py [--inventario RUTA] [--minimo 3] [--max-escenas 8] [--forzar]

No pisa un encargo que ya exista (los textos escritos a mano son lo valioso)
salvo con --forzar. Imprime la lista de lugares ordenada por búsquedas al mes.
"""
import argparse, collections, json, pathlib, re, sys, unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--inventario", type=pathlib.Path, default=ROOT / "docs/seo/datos/commons/inventario.jsonl")
ap.add_argument("--lugares", type=pathlib.Path, default=ROOT / "docs/seo/monumentos.json")
ap.add_argument("--demanda", type=pathlib.Path, default=ROOT / "docs/seo/datos", help="carpeta con monumentos_{mercado}.json")
ap.add_argument("--salida", type=pathlib.Path, default=ROOT / "tooling/commons/encargos")
ap.add_argument("--minimo", type=int, default=3, help="panorámicas mínimas para proponer un lugar")
ap.add_argument("--max-escenas", type=int, default=8, help="panorámicas por encargo (las más anchas)")
ap.add_argument("--forzar", action="store_true", help="reescribir encargos que ya existen")
args = ap.parse_args()

PARADAS = {"the", "of", "de", "del", "la", "el", "le", "les", "des", "du", "di", "da", "and", "y", "e"}
# Países tal como aparecen en las categorías de Commons («... in France», «... of Italy»)
PAISES = {
    "spain": "ES", "france": "FR", "italy": "IT", "germany": "DE", "portugal": "PT", "united kingdom": "GB", "england": "GB",
    "scotland": "GB", "wales": "GB", "ireland": "IE", "netherlands": "NL", "the netherlands": "NL", "belgium": "BE", "austria": "AT",
    "switzerland": "CH", "greece": "GR", "turkey": "TR", "czech republic": "CZ", "czechia": "CZ", "poland": "PL", "hungary": "HU",
    "russia": "RU", "sweden": "SE", "norway": "NO", "denmark": "DK", "finland": "FI", "croatia": "HR", "romania": "RO",
    "united states": "US", "the united states": "US", "canada": "CA", "mexico": "MX", "brazil": "BR", "argentina": "AR", "peru": "PE",
    "chile": "CL", "colombia": "CO", "cuba": "CU", "egypt": "EG", "morocco": "MA", "south africa": "ZA", "jordan": "JO",
    "israel": "IL", "united arab emirates": "AE", "india": "IN", "china": "CN", "japan": "JP", "south korea": "KR", "thailand": "TH",
    "cambodia": "KH", "vietnam": "VN", "indonesia": "ID", "australia": "AU", "new zealand": "NZ", "vatican city": "VA",
}


def norm(s):
    s = unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def palabras(lugar):
    return [w for w in norm(lugar).split() if len(w) > 1 and w not in PARADAS]


def slugify(s):
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", norm(s)))[:64] or "sin-titulo"


def titulo_limpio(titulo):
    t = re.sub(r"^File:", "", titulo)
    return re.sub(r"\.[a-z0-9]+$", "", t, flags=re.I)


# --- Demanda: búsquedas al mes por lugar y mercado, e idioma con más volumen ---
lugares = json.load(open(args.lugares))
por_norm = sorted(((norm(l), l) for l in lugares), key=lambda x: -len(x[0]))  # los nombres largos primero (sagrada familia interior > sagrada familia)
demanda = collections.defaultdict(lambda: collections.Counter())
idioma = collections.defaultdict(lambda: collections.Counter())
for f in sorted(args.demanda.glob("monumentos_*.json")):
    mercado = f.stem.split("_", 1)[1]
    for k in json.load(open(f)):
        vol = k.get("search_volume") or 0
        if vol <= 0:
            continue
        kw = " " + norm(k.get("keyword", "")) + " "
        lugar = next((l for n, l in por_norm if " " + n + " " in kw), None)
        if lugar is None:
            continue
        demanda[lugar][mercado] += vol
        idioma[lugar][(k.get("language_code") or mercado.split("-")[0]).lower()] += vol

# --- Inventario: una entrada por fichero, con su texto de búsqueda ---
if not args.inventario.exists():
    sys.exit(f"No existe el inventario {args.inventario}; ejecuta antes tooling/commons/inventario.py o pasa --inventario")
ficheros, vistos = [], set()
for linea in open(args.inventario, encoding="utf8"):
    linea = linea.strip()
    if not linea:
        continue
    f = json.loads(linea)
    if f.get("titulo") in vistos or (f.get("ancho") or 0) < 4000:
        continue
    vistos.add(f["titulo"])
    f["_texto"] = " " + norm(f["titulo"] + " " + " ".join(f.get("categorias", []))) + " "
    ficheros.append(f)


def pais_de(fs):
    """País más repetido en las categorías «... in/of {País}» de los ficheros; TODO si no se sabe."""
    c = collections.Counter()
    for f in fs:
        for cat in f.get("categorias", []):
            m = re.search(r"\b(?:in|of) (?:the )?([A-Za-z][A-Za-z ]+)$", cat.replace("Category:", ""))
            if m and m.group(1).strip().lower() in PAISES:
                c[PAISES[m.group(1).strip().lower()]] += 1
    return c.most_common(1)[0][0] if c else "TODO"


# --- Cruce y escritura de encargos ---
args.salida.mkdir(parents=True, exist_ok=True)
filas = []
for lugar in lugares:
    ws = palabras(lugar)
    if not ws:
        continue
    # Todas las palabras del lugar, completas (con plural opcional): «cn tower»
    # no debe casar con cualquier «tower», ni «mars» con «Marseille»
    patrones = [re.compile(r"\b" + re.escape(w) + r"(?:s|es)?\b") for w in ws]
    coinciden = [f for f in ficheros if all(p.search(f["_texto"]) for p in patrones)]
    total = sum(demanda[lugar].values())
    if len(coinciden) < args.minimo:
        filas.append((total, lugar, len(coinciden), None))
        continue
    coinciden.sort(key=lambda f: -(f.get("ancho") or 0))
    elegidas = coinciden[: args.max_escenas]
    lang = idioma[lugar].most_common(1)[0][0] if idioma[lugar] else "en"
    nombre = " ".join(w.capitalize() for w in lugar.split())
    escenas, ids = [], set()
    for i, f in enumerate(elegidas, 1):
        limpio = titulo_limpio(f["titulo"])
        # Ids únicos aunque dos títulos largos coincidan al recortarlos
        base_id = slugify(limpio)[:40].rstrip("-") or "escena"
        sid, n = base_id, 2
        while sid in ids:
            sid, n = f"{base_id}-{n}", n + 1
        ids.add(sid)
        escenas.append({
            "id": sid,
            "file": (f.get("url") or "").split("?")[0],
            "commonsPage": f.get("pagina"),
            "title": f"TODO: título corto de la escena (fichero: {limpio})",
            "alt": "TODO: texto alternativo accesible, una frase que describa lo que se ve",
            "desc": "TODO: una o dos frases sobre la escena (opcional)",
            "author": f.get("autor"),
            "license": f.get("licencia"),
            "width": f.get("ancho"),
            "height": f.get("alto"),
            "categories": [c.replace("Category:", "") for c in f.get("categorias", [])[:6]],
        })
    encargo = {
        "slug": slugify(lugar),
        "lang": lang,
        "title": f"TODO: título SEO con el nombre del lugar (3 a 120 caracteres), por ejemplo «{nombre} en 360: recorrido virtual»",
        "description": "TODO: un párrafo de 300 a 600 caracteres sobre el lugar y lo que se ve en las escenas; solo hechos comprobados, sin inventar",
        "placeName": nombre,
        "placeCountry": pais_de(elegidas),
        "lat": None,
        "lng": None,
        "startScene": escenas[0]["id"],
        "scenes": escenas,
        "_demanda": {"total": total, "mercados": dict(demanda[lugar].most_common()), "idiomas": dict(idioma[lugar].most_common())},
        "_notas": (
            "Revisa placeName (acentos y forma oficial), placeCountry (ISO-2) y pon lat/lng del lugar. "
            "Sustituye todos los TODO. Quita las escenas que no sean del lugar o no sean panoramas esféricos completos. "
            f"Otras {len(coinciden) - len(elegidas)} panorámicas coincidentes quedan fuera del encargo."
        ),
    }
    ruta = args.salida / f"{encargo['slug']}.json"
    if ruta.exists() and not args.forzar:
        filas.append((total, lugar, len(coinciden), f"{ruta.name} (ya existe, no se toca)"))
        continue
    json.dump(encargo, open(ruta, "w", encoding="utf8"), ensure_ascii=False, indent=2)
    filas.append((total, lugar, len(coinciden), ruta.name))

filas.sort(key=lambda x: (-x[0], x[1]))
print(f"{'búsquedas/mes':>14}  {'panorámicas':>11}  lugar  →  encargo")
for total, lugar, n, ruta in filas:
    if ruta is None and n == 0:
        continue
    print(f"{total:>14}  {n:>11}  {lugar}  →  {ruta or '(menos de %d panorámicas)' % args.minimo}")
propuestos = sum(1 for f in filas if f[3] and "ya existe" not in f[3])
print(f"\n{propuestos} encargos escritos en {args.salida}")
