#!/usr/bin/env python3
"""Valida iconos SVG contra el estilo del catalogo y genera material de revision.

Uso:
  python iconos_check.py <carpeta o .svg...> [--html preview.html] [--png carpeta]

Validacion y preview.html: solo biblioteca estandar.
--png: escribe <carpeta>/<nombre>/24.png, 48.png y 72.png con rsvg-convert, cairosvg,
inkscape o magick. Con Pillow ademas crea _hoja.png (set a 48 y 24 px, fondo claro y
oscuro con la tinta aclarada como haria currentColor), _lupa.png (cada icono a 24 px
ampliado 8x con rejilla; lineas rojas = area util 4-20) y mide la cobertura de tinta.
Codigo de salida 1 si algun icono tiene ERRORES.
"""
import base64, html, math, re, shutil, subprocess, sys
import xml.etree.ElementTree as ET
from pathlib import Path

TINTA, GRIS, AZUL, NARANJA, ROJO, VERDE = "#2e3238", "#9499a1", "#06a9f4", "#ff6600", "#ea3323", "#1cb574"
PALETA = {TINTA, GRIS, AZUL, NARANJA, ROJO, VERDE, "#ffffff"}
NEUTROS = {"none", "currentcolor", "transparent"}
TRAZOS = {1.0, 1.5}
PROHIBIDOS = {"text", "image", "foreignObject", "script", "style", "filter", "use"}
NO_DIBUJA = {"svg", "g", "mask", "clipPath", "defs", "linearGradient", "radialGradient", "stop", "title", "desc"}
MIN, MAX = 3.0, 21.0
COBERTURA = (8.0, 25.0)  # % de tinta a 24 px; catalogo: mediana 13, p10-p90 8.5-24
NUM = r"-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?"
TOK = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]|" + NUM)
ARGS = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}
NOMBRES = {"black": "#000000", "white": "#ffffff", "#000": "#000000", "#fff": "#ffffff"}


def tag(el):
    return el.tag.split("}")[-1]


def color(v):
    v = NOMBRES.get(v.strip().lower(), v.strip().lower())
    if re.fullmatch(r"#[0-9a-f]{3}", v):
        v = "#" + "".join(c * 2 for c in v[1:])
    return v


def attrs(el):
    a = {k.split("}")[-1]: v for k, v in el.attrib.items()}
    for decl in a.pop("style", "").split(";"):
        if ":" in decl:
            k, v = decl.split(":", 1)
            a[k.strip()] = v.strip()
    return a


def f(a, k, d=0.0):
    try:
        return float(re.sub(r"px$", "", str(a.get(k, d))))
    except ValueError:
        return d


def arco(x1, y1, rx, ry, phi, fa, fs, x2, y2):
    """Puntos de un arco SVG (conversion a centro, especificacion SVG F.6.5)."""
    if rx == 0 or ry == 0:
        return [(x2, y2)]
    rx, ry, phi = abs(rx), abs(ry), math.radians(phi)
    c, s = math.cos(phi), math.sin(phi)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    xp, yp = c * dx + s * dy, -s * dx + c * dy
    lam = xp * xp / (rx * rx) + yp * yp / (ry * ry)
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
    den = rx * rx * yp * yp + ry * ry * xp * xp
    k = math.sqrt(max(0.0, num / den)) if den else 0.0
    if fa == fs:
        k = -k
    cxp, cyp = k * rx * yp / ry, -k * ry * xp / rx
    cx, cy = c * cxp - s * cyp + (x1 + x2) / 2, s * cxp + c * cyp + (y1 + y2) / 2
    ang = lambda ux, uy, vx, vy: math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry)
    dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry)
    if not fs and dt > 0:
        dt -= 2 * math.pi
    elif fs and dt < 0:
        dt += 2 * math.pi
    return [(cx + rx * math.cos(t1 + dt * i / 24) * c - ry * math.sin(t1 + dt * i / 24) * s,
             cy + rx * math.cos(t1 + dt * i / 24) * s + ry * math.sin(t1 + dt * i / 24) * c)
            for i in range(1, 25)]


def geometria_path(d):
    """Devuelve (puntos para la caja, segmentos rectos) de un atributo d."""
    toks, pts, segs, cmd, i = TOK.findall(d), [], [], None, 0
    cur = start = (0.0, 0.0)
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd, i = t, i + 1
            if cmd in "Zz":
                if cur != start:
                    segs.append((*cur, *start))
                cur = start
            continue
        if cmd is None or cmd in "Zz":
            break
        C, rel = cmd.upper(), cmd.islower()
        n = ARGS[C]
        v = [float(x) for x in toks[i:i + n]]
        i += n
        if len(v) < n:
            break
        x0, y0 = cur
        ox, oy = (x0, y0) if rel else (0.0, 0.0)
        if C == "H":
            seg = [(v[0] + ox, y0)]
        elif C == "V":
            seg = [(x0, v[0] + oy)]
        elif C == "A":
            fin = (v[5] + ox, v[6] + oy)
            seg = arco(x0, y0, v[0], v[1], v[2], int(v[3]), int(v[4]), *fin)
            seg[-1] = fin
        else:
            seg = [(v[k] + ox, v[k + 1] + oy) for k in range(0, n, 2)]
        if C in "LHV":
            segs.append((x0, y0, *seg[-1]))
        pts += seg
        cur = seg[-1]
        if C == "M":
            start = cur
            cmd = "l" if rel else "L"
    return pts, segs


def geometria(t, a):
    if t == "rect":
        x, y, w, h = f(a, "x"), f(a, "y"), f(a, "width"), f(a, "height")
        return [(x, y), (x + w, y + h)], [(x, y, x + w, y), (x, y, x, y + h), (x + w, y, x + w, y + h), (x, y + h, x + w, y + h)]
    if t in ("circle", "ellipse"):
        cx, cy = f(a, "cx"), f(a, "cy")
        rx = f(a, "r") if t == "circle" else f(a, "rx")
        ry = f(a, "r") if t == "circle" else f(a, "ry")
        return [(cx - rx, cy - ry), (cx + rx, cy + ry)], []
    if t == "line":
        p = (f(a, "x1"), f(a, "y1"), f(a, "x2"), f(a, "y2"))
        return [p[:2], p[2:]], [p]
    if t in ("polyline", "polygon"):
        n = [float(x) for x in re.findall(NUM, a.get("points", ""))]
        pts = list(zip(n[0::2], n[1::2]))
        ciclo = pts + pts[:1] if t == "polygon" else pts
        return pts, [(*p, *q) for p, q in zip(ciclo, ciclo[1:])]
    if t == "path":
        return geometria_path(a.get("d", ""))
    return [], []


def medio(v):
    return abs((v % 1) - 0.5) < 1e-6


def entero(v):
    return abs(v - round(v)) < 1e-6


def validar(ruta):
    errores, avisos = [], []
    try:
        raiz = ET.parse(ruta).getroot()
    except ET.ParseError as e:
        return [f"XML invalido: {e}"], []
    if tag(raiz) != "svg":
        return ["La raiz no es <svg>"], []
    ra = attrs(raiz)
    if re.sub(r"[\s,]+", " ", ra.get("viewBox", "")).strip() != "0 0 24 24":
        errores.append(f'viewBox debe ser "0 0 24 24" (tiene "{ra.get("viewBox")}")')
    if ra.get("width", "24") != "24" or ra.get("height", "24") != "24":
        avisos.append("width y height deberian ser 24")
    if not any(tag(h) == "title" for h in raiz):
        avisos.append("falta <title> con el nombre del icono")
    st = {"ids": set(), "blancos": 0, "colores": set(), "caja": None}

    def recorrer(el, her, en_mascara, transformado):
        t, a = tag(el), attrs(el)
        if t in PROHIBIDOS:
            errores.append(f"<{t}> no esta permitido (texto como trazados; sin filtros, <use> ni imagenes)")
        if "id" in a:
            if a["id"] in st["ids"]:
                errores.append(f'id repetido "{a["id"]}"')
            if not a["id"].startswith(ruta.stem + "-"):
                avisos.append(f'id "{a["id"]}" sin el prefijo "{ruta.stem}-" (chocara si se insertan varios SVG en una pagina)')
            st["ids"].add(a["id"])
        for k in ("href", "xlink:href"):
            if k in a and not a[k].startswith("#"):
                errores.append(f"referencia externa en {k}")
        if "transform" in a and not transformado:
            transformado = True
            avisos.append(f"<{t}> usa transform: escribe las coordenadas finales (asi tampoco se puede comprobar)")
        dentro = en_mascara or t in ("mask", "clipPath")
        for k in ("fill", "stroke", "stop-color", "flood-color", "color"):
            if k not in a or a[k].strip().startswith("url("):
                continue
            c = color(a[k])
            if c in NEUTROS or dentro and c in ("#000000", "#ffffff"):
                continue
            if c not in PALETA:
                errores.append(f'color fuera de paleta en {k}: "{a[k]}" (<{t}>)')
            elif c == "#ffffff" and not dentro:
                st["blancos"] += 1
        h = dict(her)
        h.update({k: a[k] for k in ("fill", "stroke", "stroke-width") if k in a})
        sw = f(h, "stroke-width", 1.0)
        trazo = color(h.get("stroke", "none"))
        relleno = color(h.get("fill", "none"))
        trazado = trazo not in ("none", "transparent")
        rellenado = relleno not in ("none", "transparent")
        if "stroke-width" in a and trazado and not dentro and sw not in TRAZOS:
            errores.append(f"stroke-width {a['stroke-width']} no permitido fuera de mascaras (1, o 1.5 en la marca de verificacion)")
        if not dentro and t not in NO_DIBUJA:
            pts, segs = geometria(t, a)
            pintura = {c for c, si in ((trazo, trazado), (relleno, rellenado)) if si}
            st["colores"] |= pintura & PALETA
            if pts and not transformado:
                m = sw / 2 if trazado else 0.0
                x0, y0 = min(p[0] for p in pts) - m, min(p[1] for p in pts) - m
                x1, y1 = max(p[0] for p in pts) + m, max(p[1] for p in pts) + m
                if x0 < MIN - 1e-6 or y0 < MIN - 1e-6 or x1 > MAX + 1e-6 or y1 > MAX + 1e-6:
                    avisos.append(f"<{t}> sale de la zona 3-21 ({x0:g},{y0:g} -> {x1:g},{y1:g})")
                if not pintura <= {ROJO, VERDE}:  # las insignias no cuentan para el tamano
                    c0 = st["caja"] or (x0, y0, x1, y1)
                    st["caja"] = (min(c0[0], x0), min(c0[1], y0), max(c0[2], x1), max(c0[3], y1))
            if not transformado and (trazado and abs(sw - 1) < 1e-6 or rellenado and not trazado):
                ok = medio if trazado else entero
                malos = [s for s in segs if (s[1] == s[3] and s[0] != s[2] and not ok(s[1]))
                         or (s[0] == s[2] and s[1] != s[3] and not ok(s[0]))]
                if malos:
                    x0_, y0_, x1_, y1_ = malos[0]
                    que = "trazo de 1 px fuera de coordenada .5" if trazado else "borde de relleno fuera de coordenada entera"
                    avisos.append(f"<{t}> {len(malos)} tramo(s) recto(s) con {que}, quedan borrosos: ({x0_:g},{y0_:g})-({x1_:g},{y1_:g})")
        for hijo in el:
            recorrer(hijo, h, dentro, transformado)

    recorrer(raiz, {"fill": ra.get("fill", "#000000")}, False, False)
    if st["blancos"]:
        avisos.append("blanco fuera de una mascara: signos y huecos van recortados (transparentes), no pintados")
    acentos = st["colores"] & {AZUL, NARANJA}
    if len(acentos) > 1 or len(st["colores"] & {AZUL, NARANJA, ROJO, VERDE}) > 2:
        avisos.append("mas de un acento de color: salvo que el icono trate de color o muestras, deja uno (mas la insignia)")
    if st["caja"]:
        x0, y0, x1, y1 = st["caja"]
        if max(x1 - x0, y1 - y0) < 14:
            avisos.append(f"dibujo principal pequeno ({x1 - x0:g}x{y1 - y0:g}): deberia llenar el area 4-20 al menos en un eje")
    return errores, avisos


def rasterizar(svg, png, px):
    if shutil.which("rsvg-convert"):
        return subprocess.run(["rsvg-convert", "-w", str(px), "-h", str(px), "-o", str(png), str(svg)]).returncode == 0
    try:
        import cairosvg
        cairosvg.svg2png(url=str(svg), write_to=str(png), output_width=px, output_height=px)
        return True
    except Exception:
        pass
    if shutil.which("inkscape"):
        return subprocess.run(["inkscape", str(svg), "-w", str(px), "-h", str(px), "-o", str(png)],
                              capture_output=True).returncode == 0
    if shutil.which("magick"):
        return subprocess.run(["magick", "-background", "none", "-density", str(96 * px // 24), str(svg),
                               "-resize", f"{px}x{px}", str(png)]).returncode == 0
    return False


def revision(pngdir, nombres):
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("(sin Pillow: no se crean _hoja.png ni _lupa.png ni la cobertura)")
        return
    ic = {n: {s: Image.open(pngdir / n / f"{s}.png").convert("RGBA") for s in (24, 48)} for n in nombres}

    def aclarar(im):  # simula currentColor en tema oscuro
        im = im.copy()
        px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if abs(r - 46) + abs(g - 50) + abs(b - 56) < 60:
                    px[x, y] = (230, 233, 239, a)
        return im

    cols = min(10, len(nombres))
    filas = (len(nombres) + cols - 1) // cols
    ancho, alto = cols * 64, filas * 64
    hoja = Image.new("RGBA", (ancho * 2, alto + 16 + filas * 32), (255, 255, 255, 255))
    ImageDraw.Draw(hoja).rectangle([ancho, 0, ancho * 2, hoja.height], fill=(23, 27, 34, 255))
    for i, n in enumerate(nombres):
        x, y, y24 = (i % cols) * 64 + 8, (i // cols) * 64 + 8, alto + 8 + (i // cols) * 32
        x24 = (i % cols) * 32 + 8
        for dx, f_ in ((0, lambda im: im), (ancho, aclarar)):
            hoja.alpha_composite(f_(ic[n][48]), (x + dx, y))
            hoja.alpha_composite(f_(ic[n][24]), (x24 + dx, y24))
    hoja.save(pngdir / "_hoja.png")

    z, cols = 8, min(6, len(nombres))
    celda = 24 * z + 16
    filas = (len(nombres) + cols - 1) // cols
    lupa = Image.new("RGBA", (cols * celda, filas * (celda + 14)), (255, 255, 255, 255))
    d = ImageDraw.Draw(lupa)
    for i, n in enumerate(nombres):
        ox, oy = (i % cols) * celda + 8, (i // cols) * (celda + 14) + 18
        d.text((ox, oy - 14), n[:30], fill=(90, 90, 90, 255))
        for k in range(25):
            c = (235, 80, 80, 255) if k in (4, 20) else (226, 230, 238, 255)
            d.line([(ox + k * z, oy), (ox + k * z, oy + 24 * z)], fill=c)
            d.line([(ox, oy + k * z), (ox + 24 * z, oy + k * z)], fill=c)
        lupa.alpha_composite(ic[n][24].resize((24 * z, 24 * z), Image.NEAREST), (ox, oy))
    lupa.save(pngdir / "_lupa.png")

    print(f"Revision: {(pngdir / '_hoja.png').resolve()} y {(pngdir / '_lupa.png').resolve()}")
    print(f"Cobertura de tinta a 24 px (objetivo {COBERTURA[0]:g}-{COBERTURA[1]:g} %, mediana del catalogo 13 %):")
    for n in nombres:
        cov = sum(i * c for i, c in enumerate(ic[n][24].getchannel("A").histogram())) / 255 / 576 * 100
        marca = "  <- ligero" if cov < COBERTURA[0] else ("  <- pesado" if cov > COBERTURA[1] else "")
        print(f"    {cov:5.1f} %  {n}{marca}")


def preview(archivos, salida):
    uris = {p: "data:image/svg+xml;base64," + base64.b64encode(p.read_bytes()).decode() for p in archivos}
    def imgs(p):
        return "".join(f'<img src="{uris[p]}" width="{s}" height="{s}">' for s in (24, 48, 72))
    tarjetas = "".join(f'<figure><div class="c">{imgs(p)}</div><figcaption>{html.escape(p.stem)}</figcaption></figure>'
                       for p in archivos)
    tira = "".join(f'<img title="{html.escape(p.stem)}" src="{uris[p]}" width="24" height="24">' for p in archivos)
    salida.write_text(f"""<!DOCTYPE html><html lang="es"><meta charset="utf-8"><title>Vista previa de iconos</title>
<style>body{{font:14px 'Segoe UI',system-ui,sans-serif;background:#f2f5f9;color:#1b2430;margin:24px}}
.tira{{background:#fff;border:1px solid #d4dce7;border-radius:8px;padding:10px;display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}}
.g{{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}}
figure{{margin:0;background:#fff;border:1px solid #d4dce7;border-radius:10px;padding:8px}}
.c{{display:flex;align-items:flex-end;justify-content:center;gap:14px;padding:8px;border-radius:7px;height:92px;
background:conic-gradient(#f8fafd 0 25%,#e4eaf2 0 50%,#f8fafd 0 75%,#e4eaf2 0) 0 0/16px 16px}}
figcaption{{font-size:12.5px;margin-top:6px;word-break:break-all}}</style>
<h1 style="font-size:17px">Vista previa: {len(archivos)} iconos</h1>
<p>Tira a 24 px (tamaño real de uso):</p><div class="tira">{tira}</div>
<div class="g">{tarjetas}</div></html>""", encoding="utf-8")


def main():
    args = sys.argv[1:]
    salida_html = png_dir = None
    for flag in ("--html", "--png"):
        if flag in args:
            i = args.index(flag)
            val = Path(args[i + 1])
            del args[i:i + 2]
            salida_html, png_dir = (val, png_dir) if flag == "--html" else (salida_html, val)
    archivos = []
    for a in args or ["."]:
        p = Path(a)
        archivos += sorted(p.glob("*.svg")) if p.is_dir() else [p]
    if not archivos:
        sys.exit("No se encontraron .svg")
    fallos = 0
    for p in archivos:
        errores, avisos = validar(p)
        fallos += bool(errores)
        print(f"[{'ERROR' if errores else ('AVISO' if avisos else 'OK')}] {p.name}")
        for e in errores:
            print(f"    ERROR: {e}")
        for w in avisos:
            print(f"    aviso: {w}")
    if salida_html:
        preview(archivos, salida_html)
        print(f"Vista previa: {salida_html.resolve()}")
    if png_dir:
        ok = True
        for p in archivos:
            (png_dir / p.stem).mkdir(parents=True, exist_ok=True)
            for s in (24, 48, 72):
                ok = rasterizar(p, png_dir / p.stem / f"{s}.png", s) and ok
        if ok:
            print(f"PNG en {png_dir.resolve()}")
            revision(png_dir, [p.stem for p in archivos])
        else:
            print("No se pudo rasterizar: instala cairosvg (pip install cairosvg) o rsvg-convert, inkscape o magick")
    sys.exit(1 if fallos else 0)


if __name__ == "__main__":
    main()
