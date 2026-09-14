#!/usr/bin/env python3
"""Inventario de TODAS las panorámicas esféricas libres de Wikimedia Commons:
recorre el árbol de «Category:360° panoramas» (subcategorías por país, ciudad
y edificio) y guarda cada fichero 2:1 con su tamaño, licencia, autor y
categorías. Después se cruza con la demanda (docs/seo/datos/monumentos_*.json)
para decidir qué tours montar. Solo lectura, sin clave. Reanudable.

Salida: docs/seo/datos/commons/inventario.jsonl (una línea por fichero) y
docs/seo/datos/commons/categorias.json (cuántos ficheros útiles por categoría).
"""
import json, re, sys, time, pathlib, urllib.parse, urllib.request, collections

API = "https://commons.wikimedia.org/w/api.php"
UA = "Andarama/1.0 (https://andarama.com; inventario de panorámicas para la galería)"
OUT = pathlib.Path(__file__).resolve().parents[2] / "docs/seo/datos/commons"; OUT.mkdir(parents=True, exist_ok=True)
INV = OUT / "inventario.jsonl"; CATS = OUT / "categorias.json"; HECHAS = OUT / "categorias_vistas.txt"
RAICES = ["Category:360° panoramas", "Category:Equirectangular panoramas", "Category:Spherical panoramas"]
LIBRES = re.compile(r"^(cc0|cc-by(-sa)?-[0-9.]+|pd|public domain|cc-zero)", re.I)
MAX_CATS = int(sys.argv[1]) if len(sys.argv) > 1 else 3000

def api(params):
    params = {**params, "format": "json", "formatversion": "2"}
    for intento in range(4):
        try:
            req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)
        except Exception as e:
            time.sleep(2 * (intento + 1))
    return {}

def miembros(cat, tipo="subcat|file"):
    subcats, ficheros, cont = [], [], {}
    while True:
        r = api({"action": "query", "list": "categorymembers", "cmtitle": cat, "cmtype": tipo, "cmlimit": 500, **cont})
        for m in r.get("query", {}).get("categorymembers", []):
            (subcats if m["ns"] == 14 else ficheros).append(m["title"])
        cont = r.get("continue", {})
        if not cont: break
    return subcats, ficheros

def info(titulos):
    out = []
    for i in range(0, len(titulos), 50):
        r = api({"action": "query", "titles": "|".join(titulos[i:i+50]), "prop": "imageinfo|categories", "iiprop": "url|size|extmetadata|mime", "cllimit": 30})
        for p in r.get("query", {}).get("pages", []):
            ii = (p.get("imageinfo") or [{}])[0]
            if not ii or not str(ii.get("mime", "")).startswith("image/"): continue
            w, h = ii.get("width", 0), ii.get("height", 0)
            if w < 4000 or not h or abs(w / h - 2) > 0.04: continue
            meta = ii.get("extmetadata", {}); lic_id = (meta.get("License", {}).get("value") or "").lower()
            lic = meta.get("LicenseShortName", {}).get("value") or ""
            if not (LIBRES.match(lic_id) or LIBRES.match(lic.lower().replace(" ", "-"))): continue
            out.append({"titulo": p["title"], "pagina": ii.get("descriptionurl"), "url": ii.get("url"), "ancho": w, "alto": h,
                        "licencia": lic, "autor": re.sub("<[^>]+>", "", meta.get("Artist", {}).get("value") or "")[:120],
                        "fecha": (meta.get("DateTimeOriginal", {}).get("value") or "")[:10],
                        "categorias": [c["title"] for c in p.get("categories", [])]})
    return out

vistas = set(HECHAS.read_text().split("\n")) if HECHAS.exists() else set()
cola = collections.deque(RAICES); n_cats = 0; n_files = 0
conteo = json.load(open(CATS)) if CATS.exists() else {}
with open(INV, "a") as inv, open(HECHAS, "a") as hech:
    while cola and n_cats < MAX_CATS:
        cat = cola.popleft()
        if cat in vistas: continue
        vistas.add(cat); hech.write(cat + "\n"); n_cats += 1
        # Las raíces tienen decenas de miles de ficheros sueltos sin lugar: solo se piden sus subcategorías
        subcats, ficheros = miembros(cat, "subcat") if cat in RAICES else miembros(cat)
        # Solo bajamos por subcategorías que sigan hablando de panorámicas (evita colarse en «Paris» entero)
        for s in subcats:
            if re.search(r"360|panoram|equirect|spherical|photo sphere", s, re.I) and s not in vistas: cola.append(s)
        utiles = info(ficheros[:400]) if ficheros else []
        for f in utiles: inv.write(json.dumps(f, ensure_ascii=False) + "\n")
        inv.flush(); n_files += len(utiles); conteo[cat] = len(utiles)
        print(f"{n_cats:5} {len(utiles):3} útiles / {len(ficheros):4} ficheros · cola {len(cola):4} · {cat}", file=sys.stderr)
        if n_cats % 20 == 0: json.dump(conteo, open(CATS, "w"), ensure_ascii=False, indent=0)
json.dump(conteo, open(CATS, "w"), ensure_ascii=False, indent=0)
print(f"hecho: {n_cats} categorías nuevas, {n_files} panorámicas útiles nuevas; cola pendiente {len(cola)}")
