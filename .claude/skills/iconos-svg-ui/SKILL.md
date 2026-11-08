---
name: iconos-svg-ui
description: "Usar cuando haya que dibujar o revisar iconos SVG nuevos para la interfaz (barras de herramientas, cinta, menús) con el estilo del catálogo de referencia del usuario: rejilla de 24 px alineada al píxel, trazo de 1 px, paleta cerrada, insignias de estado y validación con iconos_check.py. También cuando se pida un set de iconos coherente o se mencione el catálogo de F:\\iconos."
---

# Iconos SVG con el estilo del catálogo

Esta habilidad dibuja iconos SVG **nuevos** que encajan con el catálogo de referencia del usuario (`F:\iconos\catalogo-iconos.html`: unos 2 950 iconos de una aplicación de diseño, exportados a 24, 48 y 72 px). La meta es que un icono nuevo pueda ponerse en la misma barra de herramientas que los existentes sin que se note que es de otra mano.

El catálogo sirve para absorber el lenguaje visual (rejilla, grosor, paleta, metáforas), no como plantilla para calcar. Dibuja cada icono desde cero: los iconos del catálogo pertenecen a su autor y un calco no aporta nada nuevo. Si piden "el mismo icono que X del catálogo", dibuja tu propia versión del concepto.

**El estilo en una frase:** iconos planos de herramienta profesional, con geometría nítida alineada al píxel, trazo fino de 1 px en gris pizarra, rellenos sólidos para el objeto que actúa y, como mucho, un toque de color que señala la parte importante.

## 1. Lienzo y rejilla

- `viewBox="0 0 24 24"`, `width="24" height="24"`. Se exporta a 24, 48 y 72 px (1x, 2x, 3x), así que se diseña para 1 px a 24.
- **Área útil de 4 a 20** (16x16 centrado). El dibujo principal, sin contar insignias, llena ese cuadro al menos en un eje y toca dos de sus lados. Un icono que flota pequeño en el centro desentona con el resto.
- **Zona de desborde de 3 a 21**: solo para insignias, puntas de flecha, mangos de lupa, lápices o cursores que asoman. Nada pasa de ahí.
- **Alineación al píxel**, que es lo que hace que se vean nítidos:
  - trazos de 1 px en coordenadas .5 (`x="4.5"`) y rectángulos trazados con ancho y alto enteros (`x="4.5" width="15"` va de 4 a 20);
  - rellenos con bordes rectos en coordenadas enteras (`x="5" width="13"`);
  - **ejes de simetría**: el centro 12 cae entre dos píxeles. Si el icono tiene una línea central de 1 px, colócala en 11.5 y haz la forma de ancho impar centrada en 11.5 (de 5 a 18, de 4 a 19).

  Diagonales y curvas se suavizan solas; no las fuerces.

## 2. Trazo y forma

- **Un solo grosor visible: `stroke-width="1"`.** El énfasis se logra con relleno sólido, nunca engrosando el trazo. Si una pieza necesita más cuerpo (el aro de una lupa pesada, un mango), dibújala como forma rellena. Única excepción de trazo: la marca de verificación verde, a 1.5.
- Uniones y remates: `miter` con remate plano para geometría recta (marcos, páginas, tablas); `round` para curvas, arcos y trazos libres (flecha de deshacer, conectores, ondas). En ángulos muy agudos, usa `round` para que la punta del inglete no se salga.
- Esquinas: rectas en páginas, marcos y tablas; `rx="1"` en "objetos" (ventanas, botones, cuerpo de aparatos, la forma cuadrada genérica). No redondees más de 1.5.
- **¿Contorno o relleno?** Lo que se reconoce por su silueta (persona, gota, lápiz, candado, cuerpo de impresora, mango) va relleno. Lo que se reconoce por su estructura interna o es un área (página con líneas, tabla, ventana, marco, selección, disquete con sus partes) va en contorno, con sus detalles internos rellenos o en trazo. Mezclar ambos en un icono es lo normal; evita que todo sea relleno, porque el icono se vuelve una mancha.
- **Separación de 1 px**: cuando una pieza se superpone a otra (insignia sobre un marco, cursor sobre un objeto, lupa sobre una página), recorta la de abajo con un hueco transparente de 1 px alrededor de la de arriba. Se hace con una máscara: dentro de `<mask>` dibuja la pieza de arriba en negro, rellena y con un trazo negro de 2 (o, si es un trazo, con su grosor más 2). Dentro de las máscaras vale cualquier grosor; solo se usa negro y blanco.
- **Huecos y signos recortados, no pintados de blanco**: el signo de una insignia, el agujero de una etiqueta o las ranuras de un objeto relleno son transparentes (máscara o `fill-rule="evenodd"`), para que el icono funcione sobre cualquier fondo.
- Líneas discontinuas:
  - selección o marco punteado: `stroke-dasharray="1 1"`;
  - guías, márgenes y límites: `stroke-dasharray="2 1"`, normalmente en azul;
  - trayectorias curvas punteadas (historial, recorrido): `1.5 1.5` con remate redondo.
- **Receta del marco punteado nítido**: dibuja cada lado como un segmento propio que empieza en una coordenada entera de su eje y abarca un número impar de píxeles, para que ambas esquinas queden pintadas: `M5 5.5H18M5 17.5H18M5.5 5V18M17.5 5V18` con `1 1`. Para `2 1`, la longitud debe ser 3k+2.
- Manijas de selección: cuadrados rellenos de 2x2 en las esquinas. Transparencia: damero de cuadros de 2x2.
- **Flechas rectas** (mover, exportar, importar, dirección): asta de trazo 1 y punta triangular rellena de 5 de base (el lado perpendicular al asta) por 3 de fondo; hasta 7x4 si la flecha es la protagonista. **Flechas curvas** de deshacer, rehacer o girar: punta abierta en V con trazo 1.
- **Lupa** (buscar, ampliar): aro de trazo 1 y mango relleno en diagonal de unos 2.5 de grueso, hacia abajo a la derecha, que puede asomar hasta 20.5. Como modificador, va abajo a la derecha sobre el objeto, recortándolo 1 px. Como protagonista:

  ```svg
  <circle cx="10.5" cy="10.5" r="5.5" stroke="#2E3238" stroke-width="1"/>
  <path d="M14.4 16.2L16.2 14.4L20.6 18.8L18.8 20.6Z" fill="#2E3238"/>
  ```

- **Letras sin texto real**: nada de `<text>`, porque las fuentes no viajan con el SVG. Letras o números se dibujan como trazados de palo seco geométrico, en una celda mínima de 3x5 px con 1 px de separación, como mucho tres caracteres ("PDF" ya ocupa unos 11 px de ancho). Si no caben, busca otra metáfora.
- Sin degradados, sombras ni filtros. Única excepción: un degradado de tinta a transparente cuando el concepto mismo es transparencia o fundido.

## 3. Paleta cerrada

| Rol | Hex | Uso |
|---|---|---|
| Tinta | `#2E3238` | Casi todo el dibujo. Todo icono empieza aquí, y la mayoría termina aquí. |
| Gris secundario | `#9499A1` | Lo que es referencia y no protagonista: estado anterior u original, marco fantasma, elemento inactivo, segundo plano. |
| Azul | `#06A9F4` | La parte sobre la que se actúa: guía, selección activa, objeto afectado, agua o color. |
| Naranja | `#FF6600` | Advertencia, luz, efecto, energía. |
| Rojo | `#EA3323` | Insignia de quitar o eliminar, límite, error. |
| Verde | `#1CB574` | Insignia de añadir, confirmación o verificación. |
| Blanco | `#FFFFFF` | Casi nunca: solo dentro de máscaras. |

**El color significa algo.** Unos 9 de cada 10 iconos del catálogo son monocromos. Usa como mucho **un acento** en el dibujo principal, más, opcionalmente, **una insignia** de estado. Antes de añadir color, nombra qué parte señala; si no sabes decirlo, va en tinta.

- Si la insignia ya expresa la acción (añadir, eliminar), el resto del icono va en tinta: no hace falta pintar además la fila o el objeto afectado.
- Nada de colores de marca o de formato (un PDF no va en rojo; el rojo está reservado a eliminar y error). El formato se indica con letras en tinta o con la forma del documento.
- Excepción: iconos sobre color o muestras pueden llevar varias muestras planas (azul, naranja, rojo, verde).

Si la app necesita tema oscuro o tematizar por CSS, sustituye `#2E3238` por `currentColor`. Como la tinta es un solo color, es un único cambio.

## 4. Composición: cómo pensar un icono

1. Escribe en una frase qué muestra: *objeto principal + modificador*. Por ejemplo, "carpeta + insignia de añadir" o "dos barras + guía central azul".
2. Elige la metáfora más común y reconocible a 16 px. Si hacen falta dos objetos, uno es el principal (grande, abajo a la izquierda) y el otro el modificador (pequeño, arriba a la derecha o superpuesto).
3. Decide contorno o relleno por pieza (sección 2) y dónde va el acento, si hay.
4. Antes de escribir el SVG, anota las coordenadas en la rejilla.

Modificadores habituales: insignia de estado (arriba a la derecha), flecha de acción (asoma por un lado o una esquina), cursor (abajo a la derecha, sobre el objeto), lápiz (editar, en diagonal arriba a la derecha), engranaje (configurar), lupa (buscar, abajo a la derecha).

**Peso visual**: la tinta cubre entre el 8 % y el 25 % del lienzo a 24 px (mediana del catálogo: 13 %). El script lo mide. Si un icono pasa del 25 %, aligera: pasa una pieza de relleno a contorno o quita detalle interno. Si queda por debajo del 8 %, rellena la pieza protagonista o agrándala.

## 5. Insignias de estado

Ocupan siempre la misma casilla, el cuadro **14 a 21 por 3 a 10** (7x7, centro 17.5, 6.5), y el dibujo de debajo se recorta 1 px alrededor. No cuentan para la regla del área útil: el dibujo principal debe llenarla por sí solo.

- **Quitar o eliminar**: círculo rojo `cx="17.5" cy="6.5" r="3.5"`, con un menos recortado `M15 6.5H20`. Hueco: círculo de `r="4.5"`.
- **Añadir**: cuadrado verde `x="14" y="3" width="7" height="7" rx="1"`, con un más recortado `M17.5 4V9M15 6.5H20`. Hueco: `x="13" y="2" width="9" height="9" rx="2"`.
- **Confirmado**: marca verde sin contenedor, trazo 1.5, por ejemplo `M14.5 6.5L16.5 8.5L20 4`, con remates redondos.
- Advertencia: triángulo naranja relleno con signo de exclamación recortado.

Patrón con máscaras (los id llevan el nombre del icono como prefijo, para que no choquen si se insertan varios SVG en la misma página):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <title>carpeta-agregar</title>
  <defs>
    <mask id="carpeta-agregar-hueco" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
      <rect width="24" height="24" fill="#fff"/>
      <rect x="13" y="2" width="9" height="9" rx="2" fill="#000"/>
    </mask>
    <mask id="carpeta-agregar-signo" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
      <rect width="24" height="24" fill="#fff"/>
      <path d="M17.5 4V9M15 6.5H20" stroke="#000" stroke-width="1"/>
    </mask>
  </defs>
  <path mask="url(#carpeta-agregar-hueco)" d="M4.5 6.5H9.5L11.5 8.5H19.5V18.5H4.5Z" stroke="#2E3238" stroke-width="1"/>
  <rect mask="url(#carpeta-agregar-signo)" x="14" y="3" width="7" height="7" rx="1" fill="#1CB574"/>
</svg>
```

## 6. Más ejemplos de referencia

Guía de acento sobre formas rellenas, con eje en 11.5 y barras de ancho impar:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <title>alinear-centro-vertical</title>
  <rect x="5" y="6" width="13" height="4" fill="#2E3238"/>
  <rect x="8" y="14" width="7" height="4" fill="#2E3238"/>
  <path d="M11.5 4V20" stroke="#06A9F4" stroke-width="1" stroke-dasharray="2 1"/>
</svg>
```

Marco punteado nítido, objeto afectado en azul y cursor relleno:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <title>seleccion-objeto</title>
  <path d="M5 5.5H18M5 17.5H18M5.5 5V18M17.5 5V18" stroke="#2E3238" stroke-width="1" stroke-dasharray="1 1"/>
  <rect x="9" y="9" width="5" height="5" fill="#06A9F4"/>
  <path d="M14 14L19.5 15.5L17 17L15.5 19.5Z" fill="#2E3238"/>
</svg>
```

Objeto relleno con hueco recortado mediante `evenodd`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <title>etiqueta</title>
  <path fill="#2E3238" fill-rule="evenodd" d="M4 4H11L20 13L13 20L4 11Z M8 6.5A1.5 1.5 0 1 0 8 9.5A1.5 1.5 0 1 0 8 6.5Z"/>
</svg>
```

## 7. Convenciones del archivo

- Raíz con `fill="none"`; color y grosor en cada elemento o grupo (`stroke="#2E3238" stroke-width="1"`). Hex en mayúsculas.
- Coordenadas con como mucho dos decimales, preferiblemente en pasos de .5 (.25 si una curva lo pide). Comandos de trazado absolutos (M, L, H, V…), fáciles de auditar contra la rejilla.
- Sin `transform`: escribe las coordenadas finales. Sin `<style>`, `<use>`, `<image>`, `<filter>` ni referencias externas.
- `<title>` con el nombre del icono. Un archivo por icono, en kebab-case y en el idioma del usuario (`alinear-centro-vertical.svg`).

## 8. Flujo de trabajo

1. **Entiende el pedido.** Por cada icono, la frase de la sección 4. Si es un set, haz la lista completa y fija las decisiones comunes (qué metáfora base comparten, qué color significa qué) antes de dibujar el primero.
2. **Calibra con el catálogo, si está accesible.** Busca en `F:\iconos` archivos con nombres afines al concepto (por ejemplo, `*align*`, `*delete*`, `*table*`; las variantes están en `<icono>.ico.png/24.png|48.png|72.png`) y mira dos o tres a 72 px para ajustar densidad y peso visual. Es para calibrar, no para copiar.
3. **Dibuja** cada SVG a mano siguiendo las secciones 1 a 7.
4. **Valida** con el script de la sección 9. Corrige todos los ERRORES. Revisa cada aviso: la mayoría señalan algo borroso o fuera de sitio; uno es aceptable solo si sabes decir por qué (por ejemplo, una punta de flecha que asoma a propósito).
5. **Mira el resultado.** Un [OK] del validador no basta: no ve si el icono se entiende. Abre las imágenes de revisión que genera `--png`:
   - en `_lupa.png` (24 px ampliado 8x sobre la rejilla, con el área útil en rojo) busca bordes rectos borrosos de medio píxel, piezas que se funden por falta de hueco y dientes o detalles que a 24 px se vuelven papilla (todo detalle repetido necesita al menos 2 px de tamaño y 1 px de separación);
   - en `_hoja.png`, a tamaño real, comprueba que se entiende qué es cada icono sin leer el nombre y que el peso es parejo en el set (la tira a 24 px delata al que sobra o se queda corto). La mitad oscura muestra el icono con la tinta aclarada, como quedaría con `currentColor` en un tema oscuro: sirve para ver si la silueta sigue leyéndose;
   - en la cobertura que imprime el script, comprueba que cada icono queda entre 8 % y 25 %.

   Corrige e itera hasta que todo pase. Si no hay rasterizador, revisa las coordenadas contra la rejilla con especial cuidado.
6. **Entrega** los `.svg` en la carpeta que indique el usuario (o en `iconos-svg/` en el directorio actual), junto con `preview.html`. Resume en una línea qué representa cada icono.

## 9. Script de validación y revisión

El script está en el bloque de código de abajo. La primera vez, extráelo del propio `SKILL.md` (en el directorio base de esta habilidad) a `iconos_check.py` con un par de líneas de Python que copien el bloque. No lo reescribas a mano: son casi 400 líneas y una copia manual introduce errores. Solo necesita la biblioteca estándar; la revisión visual usa además un rasterizador (`rsvg-convert`, `cairosvg`, Inkscape o ImageMagick) y Pillow.

```
python iconos_check.py iconos-svg --html iconos-svg/preview.html --png _revision
```

(`python3` en Linux o macOS.) Comprueba viewBox, paleta, grosores, elementos prohibidos, `<title>`, ids repetidos o sin prefijo, la zona 3 a 21 (incluidos los arcos), la alineación al píxel de los tramos rectos de cualquier forma, el exceso de acentos y el tamaño del dibujo principal.

`--png` escribe `<carpeta>/<nombre>/24.png`, `48.png` y `72.png` (la misma estructura que el catálogo), más `_hoja.png`, `_lupa.png` y la cobertura de tinta. `_revision` es material de trabajo: no lo entregues. Si el usuario pidió PNG, ejecútalo también con `--png iconos-svg/png` y borra de ahí los dos archivos que empiezan por `_`.

```python
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
```
