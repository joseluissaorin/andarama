#!/usr/bin/env python3
"""
Tubería de traducción por lotes de los diccionarios de interfaz de Andarama.

Toma un JSON fuente (es.json), una referencia (en.json) y produce un
{idioma}.json por cada idioma pedido con las mismas claves y en el mismo
orden. Traduce con OpenRouter a través de ~/.claude/skills/openrouter/scripts/or.py
(modelo barato por defecto), en lotes de ~60 claves y varios idiomas en
paralelo.

Es incremental: guarda en {salida}/.hash una huella por clave e idioma
(sobre el texto español y el inglés) y solo vuelve a traducir las claves
nuevas o cambiadas. Es reanudable: escribe el JSON y la huella tras cada
lote, así que si se corta se retoma donde estaba.

Al final valida que cada idioma tenga exactamente las claves de la fuente,
los mismos marcadores {así}, las mismas etiquetas HTML y los mismos saltos
de línea. Sale con código 1 si algo no cuadra.

Uso:
  python3 tooling/i18n/traducir.py \\
      --fuente apps/studio/src/i18n/es.json \\
      --referencia apps/studio/src/i18n/en.json \\
      --salida apps/studio/src/i18n \\
      --contexto "Andarama Studio, el editor de tours virtuales 360"

Opciones: --idiomas ar,cs (por defecto los 29 idiomas que no son es/en),
--lote 60, --paralelo 8, --modelo z-ai/glm-5.3-flash, --forzar (ignora las
huellas), --solo-validar (no traduce nada).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OR = Path.home() / ".claude/skills/openrouter/scripts/or.py"
AQUI = Path(__file__).resolve().parent
GLOSARIO_POR_DEFECTO = AQUI / "glosario.json"
MODELO_POR_DEFECTO = "z-ai/glm-5.3-flash"

# Los 32 idiomas de las apps móviles (30 más español e inglés). Los nombres en español van en la
# instrucción del modelo; las notas aclaran variante y escritura.
IDIOMAS: dict[str, str] = {
    "ar": "árabe estándar moderno",
    "cs": "checo",
    "da": "danés",
    "de": "alemán",
    "el": "griego moderno",
    "en": "inglés",
    "es": "español",
    "fi": "finés",
    "fil": "filipino (tagalo estándar)",
    "fr": "francés",
    "he": "hebreo",
    "hr": "croata",
    "hu": "húngaro",
    "id": "indonesio",
    "it": "italiano",
    "ja": "japonés",
    "ko": "coreano",
    "ms": "malayo",
    "nl": "neerlandés",
    "no": "noruego bokmål",
    "pl": "polaco",
    "pt": "portugués europeo (comprensible también en Brasil)",
    "ro": "rumano",
    "ru": "ruso",
    "sk": "eslovaco",
    "sv": "sueco",
    "th": "tailandés",
    "tr": "turco",
    "uk": "ucraniano",
    "vi": "vietnamita",
    "zh-Hans": "chino simplificado (China continental)",
    "zh-Hant": "chino tradicional (Taiwán)",
}

RE_MARCADOR = re.compile(r"\{[A-Za-z0-9_]+\}")
RE_ETIQUETA = re.compile(r"</?[A-Za-z][^<>]*>")


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def firma(es: str, en: str) -> str:
    """Huella corta del par fuente/referencia de una clave."""
    return hashlib.sha1((es + "\x1f" + en).encode("utf-8")).hexdigest()[:12]


def huellas(texto: str) -> tuple[list[str], list[str], int]:
    """Lo que una traducción debe conservar: marcadores, etiquetas y saltos."""
    return sorted(RE_MARCADOR.findall(texto)), sorted(RE_ETIQUETA.findall(texto)), texto.count("\n")


def cargar_json(ruta: Path) -> dict[str, str]:
    with ruta.open(encoding="utf-8") as f:
        return json.load(f)


def escribir_atomico(ruta: Path, datos: object) -> None:
    """Escribe el fichero entero en un temporal y lo renombra: nunca queda a medias."""
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=ruta.parent, prefix=f".{ruta.name}.", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.chmod(tmp, 0o644)
    os.replace(tmp, ruta)


# ----------------------------------------------------------------------------
# Instrucciones del modelo
# ----------------------------------------------------------------------------


def instruccion_sistema(contexto: str, glosario: dict) -> str:
    no_traducir = ", ".join(f"«{t}»" for t in glosario.get("no_traducir", []))
    terminos = "\n".join(f"  - {k}: {v}" for k, v in glosario.get("terminos", {}).items())
    return (
        "Eres un traductor profesional de interfaces de software, nativo de la lengua de destino. "
        f"Producto: {contexto}.\n"
        "Normas, todas obligatorias:\n"
        "1. Conserva EXACTAMENTE los marcadores entre llaves como {n}, {count} o {name}: ni los traduzcas, "
        "ni los quites, ni cambies su nombre. Puedes moverlos de sitio si la gramática lo pide.\n"
        "2. Conserva las etiquetas HTML y los saltos de línea (\\n) tal cual y en el mismo número.\n"
        f"3. No traduzcas ni transcribas estos nombres: {no_traducir}.\n"
        "4. Glosario (usa siempre el mismo término para el mismo concepto):\n"
        f"{terminos}\n"
        "5. Registro cercano y natural, de tú, donde la lengua lo permita; en japonés y coreano usa el registro "
        "cortés estándar; en alemán usa «du». Frases breves, propias de una interfaz: no expliques ni añadas nada.\n"
        "6. Respeta la puntuación y la tipografía propias de la lengua de destino (comillas, signos, espacios, "
        "mayúsculas). No calques la puntuación española.\n"
        "7. Si una cadena es un código, una sigla, una unidad o un nombre propio, déjala igual.\n"
        "8. Traduce del español; el inglés es solo una referencia para desambiguar el sentido.\n"
        "9. Devuelve únicamente un objeto JSON válido con exactamente las mismas claves y las traducciones como "
        "valores. Sin comentarios, sin texto antes ni después."
    )


def prompt_lote(codigo: str, entradas: dict[str, dict[str, str]]) -> str:
    return (
        f"Traduce al {IDIOMAS.get(codigo, codigo)} (código «{codigo}») las cadenas de interfaz siguientes. "
        'Cada entrada trae el original en español ("es") y su versión inglesa ("en") como referencia. '
        "Devuelve SOLO un objeto JSON plano cuyas claves sean exactamente las mismas y cuyos valores sean "
        'la traducción como cadena, con esta forma: {"clave_1": "traducción 1", "clave_2": "traducción 2"}. '
        "No repitas los originales ni anides objetos.\n\n" + json.dumps(entradas, ensure_ascii=False, indent=1)
    )


def llamar_gemini(prompt: str, sistema: str, modelo: str) -> str:
    """Una llamada directa a Gemini (--modelo gemini-…), con la clave de ~/.claude/.secrets/gemini.env."""
    from google import genai
    from google.genai import types

    clave = os.environ.get("GEMINI_API_KEY") or next(
        (
            l.split("=", 1)[1].strip()
            for l in (Path.home() / ".claude/.secrets/gemini.env").read_text().splitlines()
            if l.startswith("GEMINI_API_KEY=")
        ),
        None,
    )
    if not clave:
        sys.exit("No hay GEMINI_API_KEY ni ~/.claude/.secrets/gemini.env")
    cliente = genai.Client(api_key=clave)
    r = cliente.models.generate_content(
        model=modelo,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=sistema, temperature=0.2, response_mime_type="application/json"
        ),
    )
    return (r.text or "").strip()


def llamar_modelo(prompt: str, sistema: str, modelo: str) -> dict[str, str]:
    """Una llamada a or.py (o a Gemini si el modelo empieza por «gemini»); devuelve el JSON parseado o lanza una excepción."""
    if modelo.startswith("gemini"):
        texto = llamar_gemini(prompt, sistema, modelo)
    else:
        if not OR.exists():
            sys.exit(f"No existe {OR}: hace falta la skill openrouter.")
        r = subprocess.run(
            [sys.executable, str(OR), "--json", "-m", modelo, "-s", sistema, "-t", "0.2"],
            input=prompt,
            capture_output=True,
            text=True,
            timeout=900,
        )
        if r.returncode != 0:
            raise RuntimeError(f"or.py devolvió {r.returncode}: {r.stderr.strip()[-400:]}")
        texto = r.stdout.strip()
    # Por si el modelo envuelve la respuesta en vallas o añade una coletilla.
    inicio, fin = texto.find("{"), texto.rfind("}")
    if inicio < 0 or fin < 0:
        raise RuntimeError(f"Respuesta sin JSON: {texto[:200]!r}")
    datos = json.loads(texto[inicio : fin + 1])
    if not isinstance(datos, dict):
        raise RuntimeError("La respuesta no es un objeto JSON")
    return {str(k): v for k, v in datos.items()}


# ----------------------------------------------------------------------------
# Comprobaciones de cada traducción
# ----------------------------------------------------------------------------


def desenvolver(codigo: str, valor: object) -> object:
    """El modelo a veces devuelve {"es": …, "en": …, "de": …} en vez de la cadena: se rescata."""
    if isinstance(valor, dict):
        if isinstance(valor.get(codigo), str):
            return valor[codigo]
        resto = [v for k, v in valor.items() if k not in ("es", "en") and isinstance(v, str)]
        return resto[0] if len(resto) == 1 else valor
    return valor


def motivo_rechazo(codigo: str, clave: str, es: str, en: str, valor: object) -> str | None:
    """Devuelve por qué no se acepta una traducción, o None si es válida."""
    if not isinstance(valor, str):
        return "no es una cadena"
    if valor.strip() == "" and es.strip() != "":
        return "vacía"
    if huellas(valor) != huellas(es):
        return "marcadores, etiquetas o saltos distintos"
    palabras = len(es.split())
    # Una frase de cuatro palabras o más idéntica al original (o a la
    # referencia inglesa) es que se quedó sin traducir.
    if palabras >= 4 and codigo != "es" and valor.strip() == es.strip():
        return "idéntica al español"
    if palabras >= 4 and codigo != "en" and valor.strip() == en.strip():
        return "idéntica al inglés"
    return None


def sospechosa(codigo: str, es: str, en: str, valor: str) -> bool:
    """Para el informe final: cadenas cortas iguales al original que conviene mirar."""
    palabras = len(es.split())
    if palabras < 2:
        return False
    return (codigo != "es" and valor.strip() == es.strip()) or (codigo != "en" and valor.strip() == en.strip())


# ----------------------------------------------------------------------------
# Trabajo por idioma
# ----------------------------------------------------------------------------


class Estado:
    """Huellas compartidas entre hilos, con escritura atómica bajo cerrojo."""

    def __init__(self, ruta: Path) -> None:
        self.ruta = ruta
        self.cerrojo = threading.Lock()
        self.datos: dict[str, dict[str, str]] = {}
        if ruta.exists():
            try:
                self.datos = json.loads(ruta.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                log(f"  · {ruta.name} ilegible; se regenera")

    def de(self, codigo: str) -> dict[str, str]:
        with self.cerrojo:
            return dict(self.datos.get(codigo, {}))

    def poner(self, codigo: str, huellas_nuevas: dict[str, str], claves_validas: set[str]) -> None:
        with self.cerrojo:
            actual = self.datos.setdefault(codigo, {})
            actual.update(huellas_nuevas)
            for k in list(actual):
                if k not in claves_validas:
                    del actual[k]
            self.datos = dict(sorted(self.datos.items()))
            escribir_atomico(self.ruta, self.datos)


def traducir_idioma(
    codigo: str,
    fuente: dict[str, str],
    referencia: dict[str, str],
    salida: Path,
    estado: Estado,
    sistema: str,
    modelo: str,
    lote: int,
    forzar: bool,
    rondas: int = 3,
) -> dict[str, object]:
    ruta = salida / f"{codigo}.json"
    existente: dict[str, str] = cargar_json(ruta) if ruta.exists() else {}
    huellas_previas = estado.de(codigo)
    # Pendientes: nuevas, cambiadas o forzadas. Se conservan las que ya
    # estaban bien y no cambiaron.
    pendientes = [
        k
        for k in fuente
        if forzar or k not in existente or huellas_previas.get(k) != firma(fuente[k], referencia.get(k, ""))
    ]
    traducido: dict[str, str] = {k: v for k, v in existente.items() if k in fuente and k not in pendientes}
    hechas = 0
    llamadas = 0
    avisos: list[str] = []

    def guardar() -> None:
        ordenado = {k: traducido[k] for k in fuente if k in traducido}
        escribir_atomico(ruta, ordenado)
        estado.poner(
            codigo,
            {k: firma(fuente[k], referencia.get(k, "")) for k in ordenado},
            set(fuente),
        )

    if not pendientes:
        # Aun sin trabajo, se reescribe para asegurar orden y claves sobrantes fuera.
        if existente and list(existente) != [k for k in fuente if k in existente]:
            guardar()
        return {"codigo": codigo, "hechas": 0, "pendientes": 0, "llamadas": 0, "avisos": avisos}

    log(f"[{codigo}] {len(pendientes)} claves pendientes de {len(fuente)}")
    for ronda in range(1, rondas + 1):
        if not pendientes:
            break
        siguientes: list[str] = []
        for i in range(0, len(pendientes), lote):
            claves = pendientes[i : i + lote]
            entradas = {k: {"es": fuente[k], "en": referencia.get(k, "")} for k in claves}
            respuesta: dict[str, str] | None = None
            for intento in range(1, 4):
                try:
                    respuesta = llamar_modelo(prompt_lote(codigo, entradas), sistema, modelo)
                    llamadas += 1
                    break
                except Exception as e:  # noqa: BLE001 - reintento genérico
                    log(f"[{codigo}] lote {i // lote + 1} intento {intento}: {e}")
                    time.sleep(3 * intento)
            if respuesta is None:
                siguientes.extend(claves)
                continue
            for k in claves:
                valor = desenvolver(codigo, respuesta.get(k))
                motivo = motivo_rechazo(codigo, k, fuente[k], referencia.get(k, ""), valor)
                if motivo is None:
                    traducido[k] = valor  # type: ignore[assignment]
                    hechas += 1
                else:
                    if ronda == rondas and isinstance(valor, str) and valor.strip() != "":
                        # Última ronda: se acepta con aviso antes que dejar un hueco.
                        traducido[k] = valor
                        hechas += 1
                        avisos.append(f"{codigo}.{k}: aceptada con reparo ({motivo})")
                    else:
                        siguientes.append(k)
            guardar()
            log(f"[{codigo}] ronda {ronda}, lote {i // lote + 1}/{-(-len(pendientes) // lote)}: {len(traducido)}/{len(fuente)}")
        pendientes = siguientes
        # En las rondas siguientes los lotes se estrechan: menos ruido, más acierto.
        lote = max(10, lote // 2)

    return {"codigo": codigo, "hechas": hechas, "pendientes": len(pendientes), "llamadas": llamadas, "avisos": avisos}


# ----------------------------------------------------------------------------
# Validación final
# ----------------------------------------------------------------------------


def validar(fuente: dict[str, str], referencia: dict[str, str], salida: Path, codigos: list[str]) -> tuple[list[str], list[str]]:
    """Devuelve (errores, sospechosas)."""
    errores: list[str] = []
    dudosas: list[str] = []
    for codigo in codigos:
        ruta = salida / f"{codigo}.json"
        if not ruta.exists():
            errores.append(f"{codigo}: falta {ruta.name}")
            continue
        datos = cargar_json(ruta)
        if list(datos) != list(fuente):
            faltan = [k for k in fuente if k not in datos]
            sobran = [k for k in datos if k not in fuente]
            if faltan:
                errores.append(f"{codigo}: faltan {len(faltan)} claves ({', '.join(faltan[:5])}…)")
            if sobran:
                errores.append(f"{codigo}: sobran {len(sobran)} claves ({', '.join(sobran[:5])}…)")
            if not faltan and not sobran:
                errores.append(f"{codigo}: las claves no están en el orden de la fuente")
        for k, es in fuente.items():
            v = datos.get(k)
            if not isinstance(v, str):
                continue
            if huellas(v) != huellas(es):
                errores.append(f"{codigo}.{k}: marcadores, etiquetas o saltos distintos")
            elif sospechosa(codigo, es, referencia.get(k, ""), v):
                dudosas.append(f"{codigo}.{k} = {v!r}")
    return errores, dudosas


# ----------------------------------------------------------------------------
# Programa
# ----------------------------------------------------------------------------


def main() -> None:
    p = argparse.ArgumentParser(description="Traduce por lotes los diccionarios de interfaz de Andarama")
    p.add_argument("--fuente", required=True, type=Path, help="JSON fuente en español (es.json)")
    p.add_argument("--referencia", required=True, type=Path, help="JSON de referencia en inglés (en.json)")
    p.add_argument("--salida", required=True, type=Path, help="carpeta donde escribir {idioma}.json")
    p.add_argument("--idiomas", help="códigos separados por comas (por defecto, todos menos es y en)")
    p.add_argument("--contexto", default="la interfaz de Andarama, la plataforma de tours virtuales 360")
    p.add_argument("--glosario", type=Path, default=GLOSARIO_POR_DEFECTO)
    p.add_argument("--lote", type=int, default=60)
    p.add_argument("--paralelo", type=int, default=8, help="idiomas traduciéndose a la vez")
    p.add_argument("--modelo", default=MODELO_POR_DEFECTO)
    p.add_argument("--forzar", action="store_true", help="retraduce todo ignorando las huellas")
    p.add_argument("--solo-validar", action="store_true", help="no traduce; solo comprueba los ficheros")
    a = p.parse_args()

    fuente = cargar_json(a.fuente)
    referencia = cargar_json(a.referencia)
    codigos = [c.strip() for c in a.idiomas.split(",")] if a.idiomas else [c for c in IDIOMAS if c not in ("es", "en")]
    desconocidos = [c for c in codigos if c not in IDIOMAS]
    if desconocidos:
        sys.exit(f"Idiomas desconocidos: {', '.join(desconocidos)}")

    salida: Path = a.salida
    salida.mkdir(parents=True, exist_ok=True)

    if not a.solo_validar:
        glosario = cargar_json(a.glosario) if a.glosario.exists() else {}
        sistema = instruccion_sistema(a.contexto, glosario)
        estado = Estado(salida / ".hash")
        inicio = time.time()
        with ThreadPoolExecutor(max_workers=max(1, a.paralelo)) as pool:
            resultados = list(
                pool.map(
                    lambda c: traducir_idioma(c, fuente, referencia, salida, estado, sistema, a.modelo, a.lote, a.forzar),
                    codigos,
                )
            )
        total_llamadas = sum(int(r["llamadas"]) for r in resultados)  # type: ignore[arg-type]
        total_hechas = sum(int(r["hechas"]) for r in resultados)  # type: ignore[arg-type]
        log(f"\n{total_hechas} cadenas traducidas en {total_llamadas} llamadas ({time.time() - inicio:.0f} s)")
        for r in resultados:
            if r["pendientes"]:
                log(f"  · {r['codigo']}: quedan {r['pendientes']} claves sin traducir")
            for aviso in r["avisos"]:  # type: ignore[union-attr]
                log(f"  · {aviso}")

    errores, dudosas = validar(fuente, referencia, salida, codigos)
    if dudosas:
        log(f"\n{len(dudosas)} cadenas iguales al original que conviene mirar:")
        for d in dudosas[:80]:
            log(f"  · {d}")
        if len(dudosas) > 80:
            log(f"  · … y {len(dudosas) - 80} más")
    if errores:
        log(f"\n{len(errores)} errores de validación:")
        for e in errores:
            log(f"  · {e}")
        sys.exit(1)
    log(f"\nValidación correcta: {len(codigos)} idiomas con las {len(fuente)} claves de {a.fuente.name}.")


if __name__ == "__main__":
    main()
