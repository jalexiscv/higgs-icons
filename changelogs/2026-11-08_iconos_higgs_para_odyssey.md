# 47 iconos nuevos del grupo `common.higgs` para Higgs Odyssey

**Fecha:** 2026-11-08
**Versión:** 0.2.2
**Área:** recursos > Common/Higgs; metadatos; catálogo
**Tiempo laborado:** 16 horas
**Autor:** Jose Alexis Correa Valencia <jalexiscv@utede.edu.co>
**Asistencia:** Agente de IA (Claude)

## Descripción

Higgs Odyssey, la hoja de cálculo, adopta esta biblioteca para todos sus iconos
(su mapa `src/ui/resources/icon-map.txt`, 121 nombres). Buscando por
significado y viendo cada dibujo, 74 nombres encontraron icono en el inventario
(portapapeles, fuente, alineaciones, bordes de tabla, archivo, zoom, lupa,
gráfico circular, imagen, formas, ecuación…). Los 47 restantes son conceptos de
hoja de cálculo que la biblioteca no tenía porque viene de un programa de dibujo:
se crean aquí, en `Common/Higgs/`, con ID `common.higgs.<nombre>`, para que
sirvan a toda la familia:

`fill-color`, `border-none`, `border-thick`, `border-double-bottom`,
`border-thick-bottom`, `border-top-thick-bottom`, `border-top-double-bottom`,
`wrap-text`, `text-orientation`, `percent`, `currency`, `thousands`,
`decimals-more`, `decimals-less`, `conditional-format`, `autosum`, `fill-down`,
`fill-right`, `sort-az`, `sort-za`, `go-to`, `chart-bar`, `chart-line`,
`chart-doughnut`, `chart-area`, `chart-scatter`, `name-manager`,
`data-validation`, `note`, `freeze-panes`, `check`, `chevron-left`,
`pivot-table`, `chart-recommended`, `chart-hierarchy`, `chart-waterfall`,
`chart-stat`, `chart-combo`, `chart-pivot`, `spark-line`, `spark-column`,
`spark-winloss`, `slicer`, `timeline`, `signature`, `symbol` y `add-ins`.

**Estilo.** Dibujados a mano en SVG con el skill `iconos-svg-ui`: lienzo de
24 px, área útil de 4 a 20, trazos de 1 px alineados al píxel, tinta `#2E3238`,
gris `#9499A1` para lo secundario y un solo acento. Los cinco bordes siguen la
pauta de `apps.components.tabletool.borders-*` (marco gris, lados activos en
azul `#06A9F4`) para que el menú de bordes de Odyssey sea uniforme; los
gráficos comparten el eje de `common.higgs.chart`; «Aumentar decimales» y
«Disminuir decimales» llevan las insignias verde y roja de añadir y quitar,
como `tabletool.create-table`. `fill-color` deja libre la franja inferior
(18 a 21) donde la aplicación pinta la barra de color, igual que
`font-color`. Validados con `iconos_check.py`: sin errores; dos avisos
aceptados (`decimals-less`, un glifo de dos caracteres con insignia, y
`text-orientation`, una «A» en diagonal cuya caja de puntos mide 13,7).

**Metadatos.** Cada icono lleva en `metadata/overrides.json` su nombre y su
descripción en español, sus etiquetas y el producto `odyssey-desktop`; sus IDs
entran en `metadata/ids.json` a continuación de los de `common.higgs`.

**Procedencia.** Queda escrita en `RIGHTS-AND-PUBLISHING.md`, en una fila nueva
del grupo `Common/Higgs/`.

**Catálogo.** `catalogo-iconos-svg.html` regenerado con `node
tools/catalogo-svg.mjs` (3048 iconos); el inventario pasa de 3001 a 3048 en el
`README.md`, `index.html` y la documentación.

## Tipo de Cambio

- `Agregado`

## Archivos Afectados

### [NUEVO] `Common/Higgs/<nombre>.ico.png/light.svg` (47)
- Un dibujo claro por icono; el oscuro lo deriva el generador.

### [MODIFICADO] `metadata/ids.json`, `metadata/overrides.json`
- 47 IDs `common.higgs.*` y sus nombres, descripciones, etiquetas y producto.

### [MODIFICADO] `RIGHTS-AND-PUBLISHING.md`, `README.md`, `index.html`, `docs/arquitectura.md`, `docs/uso-escritorio.md`, `docs/uso-web.md`
- Procedencia del grupo y el total de 3048 iconos.

### [MODIFICADO] `catalogo-iconos-svg.html`, `package.json`
- Catálogo regenerado; versión 0.2.2.

## Verificación

- `node --test`: `# pass 24`, `# fail 0` (pruebas del generador y del módulo
  web).
- `node tools/build.mjs`: `Built 3048 icons for Web and Desktop.`
- `iconos_check.py` sobre los 47 SVG: 45 `[OK]`, 2 `[AVISO]` justificados
  arriba, 0 errores.
- Revisados a 24 y 48 px en una hoja de contacto rasterizada con resvg.
- Higgs Odyssey compila con los 121 iconos del mapa y pasa sus pruebas de
  iconos (`odyssey_ui_tests "[icons]"`: 13 casos).
- `dist/desktop` compilado con MSVC (Ninja, Release, objetivo `higgs_icons`)
  sin errores, como en la CI.

## Impacto

- 47 IDs nuevos; ningún ID existente cambia. Las aplicaciones que no los usan
  no notan nada.
