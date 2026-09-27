#!/usr/bin/env python3
"""Busca en Wikimedia Commons panorámicas equirectangulares (360×180) de un
lugar, con licencia y atribución, para montar tours de monumentos en la
galería de Andarama. Solo lectura, API pública, sin clave.

Uso: buscar_panoramas.py "alhambra" ["louvre" ...]  → JSON por lugar en
docs/seo/datos/commons/{lugar}.json con título, URL, ancho, alto, licencia,
autor, fecha y la URL de descarga a 8192 px como máximo.

Criterios: relación de aspecto 2:1 (±2 %), ancho ≥ 4000 px, licencia CC0,
CC BY o CC BY-SA (se excluyen NC/ND y «fair use»), y que el nombre del
fichero o sus categorías mencionen 360/panorama/equirectangular.
"""
import json, re, sys, pathlib, urllib.parse, urllib.request

API = "https://commons.wikimedia.org/w/api.php"
UA = "Andarama/1.0 (https://andarama.com; galería de tours de monumentos)"
OUT = pathlib.Path(__file__).resolve().parents[2] / "docs/seo/datos/commons"; OUT.mkdir(parents=True, exist_ok=True)
LIBRES = re.compile(r"^(cc0|cc-by(-sa)?-[0-9.]+|pd|public domain)", re.I)

def api(params):
    params = {**params, "format": "json", "formatversion": "2"}
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)

def categorias_del_lugar(lugar):
    """Categorías de Commons cuyo nombre lleva el lugar y habla de panorámicas 360."""
    r = api({"action": "query", "list": "search", "srsearch": f'"{lugar}" panoram', "srnamespace": 14, "srlimit": 30})
    cats = [s["title"] for s in r.get("query", {}).get("search", []) if re.search(r"360|equirect|spherical|panoram", s["title"], re.I)]
    r = api({"action": "query", "list": "search", "srsearch": f'"{lugar}"', "srnamespace": 14, "srlimit": 5})
    cats += [s["title"] for s in r.get("query", {}).get("search", [])]  # la categoría principal del lugar, por sus ficheros directos
    return list(dict.fromkeys(cats))

def miembros(cat, limite=200):
    r = api({"action": "query", "list": "categorymembers", "cmtitle": cat, "cmtype": "file", "cmlimit": limite})
    return [m["title"] for m in r.get("query", {}).get("categorymembers", [])]

def buscar(lugar, limite=60):
    """Ficheros por texto (frase exacta del lugar) y por categorías del lugar."""
    consultas = [f'"{lugar}" incategory:"360° panoramas"', f'"{lugar}" equirectangular', f'"{lugar}" "360°"', f'"{lugar}" "360 panorama"']
    vistos, titulos = set(), []
    for q in consultas:
        r = api({"action": "query", "list": "search", "srsearch": q, "srnamespace": 6, "srlimit": limite})
        for s in r.get("query", {}).get("search", []):
            if s["title"] not in vistos: vistos.add(s["title"]); titulos.append(s["title"])
    for cat in categorias_del_lugar(lugar):
        for tt in miembros(cat):
            if tt not in vistos: vistos.add(tt); titulos.append(tt)
    return titulos

LUGAR = ""

def info(titulos):
    out = []
    for i in range(0, len(titulos), 40):
        r = api({"action": "query", "titles": "|".join(titulos[i:i+40]), "prop": "imageinfo|categories",
                 "iiprop": "url|size|extmetadata|mime", "iiurlwidth": 8192, "cllimit": 50})
        for p in r.get("query", {}).get("pages", []):
            ii = (p.get("imageinfo") or [{}])[0]
            if not ii or not ii.get("mime", "").startswith("image/"): continue
            w, h = ii.get("width", 0), ii.get("height", 0)
            if w < 4000 or h == 0 or abs(w / h - 2) > 0.04: continue
            meta = ii.get("extmetadata", {}); lic = (meta.get("LicenseShortName", {}).get("value") or "")
            lic_id = (meta.get("License", {}).get("value") or "").lower()
            if not (LIBRES.match(lic_id) or LIBRES.match(lic.lower().replace(" ", "-"))): continue
            cats = [c["title"] for c in p.get("categories", [])]
            desc = re.sub("<[^>]+>", "", meta.get("ImageDescription", {}).get("value") or "")
            texto = (p["title"] + " " + " ".join(cats) + " " + desc).lower()
            if not re.search(r"360|panoram|equirect|spherical", texto): continue
            # El lugar tiene que aparecer de verdad (todas sus palabras significativas)
            palabras = [w for w in re.findall(r"[a-záéíóúñü']+", LUGAR.lower()) if len(w) > 2 and w not in ("the", "of", "de", "del", "la", "el")]
            if not all(w in texto for w in palabras): continue
            out.append({"titulo": p["title"], "pagina": ii.get("descriptionurl"), "url": ii.get("url"),
                        "url_8192": ii.get("thumburl") or ii.get("url"), "ancho": w, "alto": h,
                        "licencia": lic, "licencia_url": meta.get("LicenseUrl", {}).get("value"),
                        "autor": re.sub("<[^>]+>", "", meta.get("Artist", {}).get("value") or ""),
                        "atribucion": re.sub("<[^>]+>", "", meta.get("Attribution", {}).get("value") or ""),
                        "fecha": meta.get("DateTimeOriginal", {}).get("value"), "categorias": cats[:12]})
    out.sort(key=lambda x: -x["ancho"])
    return out

if __name__ == "__main__":
    for lugar in sys.argv[1:]:
        LUGAR = lugar
        res = info(buscar(lugar))
        f = OUT / (re.sub(r"[^a-z0-9]+", "-", lugar.lower()).strip("-") + ".json")
        json.dump(res, open(f, "w"), ensure_ascii=False, indent=1)
        print(f"{lugar}: {len(res)} panorámicas libres 2:1 (≥4000 px)", *(f"  {r['ancho']}×{r['alto']} {r['licencia']} {r['titulo'][:70]}" for r in res[:5]), sep="\n")
