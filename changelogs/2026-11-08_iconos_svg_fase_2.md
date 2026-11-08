# Los 2827 iconos restantes pasan a SVG: la biblioteca queda entera en dibujos vectoriales

**Fecha:** 2026-11-08
**Versión:** 0.2.1
**Área:** recursos; catalogo; pages; docs
**Tiempo laborado:** 560 horas
**Autor:** Jose Alexis Correa Valencia <jalexiscv@gmail.com>
**Asistencia:** Agente de IA (Claude), con 98 agentes en paralelo

## Descripción

Segunda y última fase de la migración a SVG decidida por el autor ([fase 1](2026-11-08_iconos_svg_fase_1.md)).
Los 2827 iconos que seguían en PNG se redibujan en SVG y pierden sus variantes PNG. Con esto los
3001 iconos de la biblioteca son solo vectoriales, en tema claro y oscuro.

**Cómo se dibujaron.** El inventario pendiente se ordenó por ruta y se repartió en 98 lotes de 29
iconos (el último, de 14), uno por agente. Cada agente miró el PNG de 72 px de cada icono, dibujó
su propia versión del concepto con el skill `iconos-svg-ui` y las restricciones de este proyecto
(raíz con `fill="none"`, solo `path`, `rect`, `circle`, `ellipse` y `g`, sin máscaras, `<defs>`,
`<text>` ni blanco, paleta cerrada, trazo de 1 px), validó con `iconos_check.py` y revisó sus
hojas a 24 px ampliado, a tamaño real y en tema oscuro. Ningún agente tocó el repositorio:
dibujaron en el directorio temporal de la sesión.

**Puerta central.** Antes de instalar, un script volvió a comprobar los 2827 archivos contra las
reglas duras (raíz exacta, `<title>`, etiquetas admitidas, paleta, grosor de trazo, sin `url(`,
`href`, `transform`, `style` ni atributos de evento). Pasaron los 2827. Un dibujo estaba guardado
con un nombre equivocado (`drw-btn-150` en lugar de `drwbtn-150`); se comprobó contra su PNG
(un cubo) y se renombró. Se revisó a mano una muestra de hojas de distintas zonas del inventario.

**Instalación.** Cada `light.svg` se copió a su directorio `.ico.png` y se borraron sus 8481 PNG
(24, 48 y 72 px). Los 19 PNG sueltos fuera de directorios `.ico.png` (plantillas y vistas de
maquetación) no son iconos de la biblioteca y no se tocaron.

**Catálogos.** `catalogo-iconos-svg.html` pasa a tener los 3001 iconos. El catálogo heredado
(`catalogo-iconos.html`) se conserva con su organización por carpetas, pero sus 2949 tarjetas
muestran ahora el `light.svg` de cada icono, porque los PNG ya no existen; se corrigen su título
y sus recuentos. La portada describe los dos catálogos.

### Decisión de diseño

Los dibujos son nuevos y no calcos: algunos simplifican detalles del PNG que a 24 px no se leían
(los agentes los declararon en su informe, por ejemplo flechas circulares o cadenas rotas). Se
aceptaron avisos del validador cuando tenían razón de ser: varios acentos de color en iconos que
tratan de color (muestras, armonías, ruedas), cobertura de tinta algo por debajo del 8 % en
iconos de línea fina por concepto (suavizados, guías, ajustes) y dibujo principal pequeño cuando
comparte casilla con una insignia.

## Tipo de Cambio

- `Cambiado`: 2827 iconos pasan de PNG a SVG; catálogos y portada.
- `Removido`: 8481 PNG.

## Archivos Afectados

### [NUEVO] 2827 archivos `light.svg` en los directorios `.ico.png` de `Apps/`, `Common/Res/` y `Engines/`
### [ELIMINADO] 8481 PNG de esos directorios
### [MODIFICADO] `catalogo-iconos-svg.html`, `catalogo-iconos.html`, `index.html`
### [MODIFICADO] `package.json`
- 0.2.0 → 0.2.1 con `npm version 0.2.1 --no-git-tag-version`.
### [MODIFICADO] `README.md`, `docs/arquitectura.md`, `docs/uso-web.md`, `docs/uso-escritorio.md`, `docs/mantenimiento.md`, `RIGHTS-AND-PUBLISHING.md`
- El inventario es todo SVG; procedencia de los dibujos nuevos.

## Verificación

- Puerta central: `total 2827 | válidos 2827 | rechazados 0 | faltan 0`; tras instalar, los 3001
  iconos tienen `light.svg` y ninguno conserva PNG.
- `node --test`: `# tests 11`, `# pass 11`, `# fail 0`.
- `node tools/build.mjs`: `Built 3001 icons for Web and Desktop.`; el manifiesto informa
  `libraryVersion` 0.2.1, 3001 iconos con `svg` y 0 con `variants`; `dist/web/assets` y
  `dist/desktop/assets` tienen 6002 SVG cada uno y ningún PNG.
- Compilación de `dist/desktop` con MSVC 19.44 (Ninja, Release, árbol fuera del proyecto):
  `[2/2] Linking CXX static library higgs_icons.lib`, código 0.
- `node tools/catalogo-svg.mjs`: `Wrote catalogo-iconos-svg.html with 3001 vector icons.`; el
  catálogo heredado no conserva ninguna referencia a PNG.
- No verificado: la CI de GitHub y los catálogos de Pages ya publicados.

## Impacto

- Ningún ID cambia. Para todos los iconos, `url`, `nearest_variant` y `resolve_path` devuelven
  `null`, `nullptr` o una ruta vacía: las aplicaciones deben usar `svgUrl`/`resolve_svg` (o
  `createImage`, que ya elige el SVG). Skriba y Presenter dibujan su vectorial propio mientras no
  lean los SVG de la biblioteca.
- Los PNG originales siguen en el historial de Git por si hiciera falta consultarlos.
- `dist/` deja de llevar PNG.
