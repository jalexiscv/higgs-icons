# La biblioteca pasa a SVG: generador con dibujos vectoriales y los 174 iconos de Skriba y Presenter migrados

**Fecha:** 2026-11-08
**Versión:** 0.2.0
**Área:** build > generador; web; desktop; catalogo; pages; recursos; metadatos; docs
**Tiempo laborado:** 40 horas
**Autor:** Jose Alexis Correa Valencia <jalexiscv@gmail.com>
**Asistencia:** Agente de IA (Claude)

## Descripción

El autor decidió que Higgs Icons deje de distribuir PNG y pase a dibujos **SVG** con dos variantes
de color (clara y oscura), nítidos a 24, 30, 36, 42, 48, 60, 72 y 128 px, dibujados con el estilo
del skill `iconos-svg-ui` (rejilla de 24 px alineada al píxel, trazo de 1 px, paleta cerrada). La
migración es **por fases**; esta primera cubre los 174 iconos que usan Higgs Skriba y Higgs
Presenter (los que tenían variantes de 30, 36, 42 y 60 px). Los otros 2827 siguen en PNG y la
biblioteca sirve ambos formatos a la vez.

Decisiones del autor que fija este cambio: camino compatible (campos aditivos, ningún ID cambia,
`schemaVersion` sigue en 1), los PNG de los iconos migrados desaparecen del inventario y de `dist/`,
un solo SVG por icono y tema (no uno por tamaño), la variante oscura es la paleta del skill
invertida, y versión menor 0.2.0 porque el manifiesto y las API ganan campos y funciones.

### Qué cambia en el generador

- Un directorio `*.ico.png` puede contener `light.svg` (obligatorio si hay SVG) y, opcionalmente,
  `dark.svg`, además o en lugar de los `<tamaño>.png`. El nombre del directorio se conserva porque
  `source` y `legacyName` son contrato con las aplicaciones.
- `readSvg` valida cada dibujo antes de emitirlo: documento `<svg>` de hasta 256 KiB,
  `viewBox="0 0 24 24"`, sin `<script>`, `<style>`, `<image>`, `<use>`, `<foreignObject>`,
  `<a>`, `href` ni `url(` externo (las referencias internas `url(#…)` se admiten). Un `dark.svg`
  sin `light.svg` detiene la generación con un mensaje que nombra el directorio.
- `deriveDarkSvg` produce el dibujo oscuro cuando el inventario no trae uno: `DARK_PALETTE` cambia
  la tinta `#2E3238` por `#E6E9EF` y el gris `#9499A1` por `#80868F`; los acentos y los colores de
  máscara no cambian.
- El manifiesto gana el campo `svg` (`{ light, dark }`, objeto vacío si el icono solo tiene PNG);
  `variants` queda vacío en los iconos solo SVG. Las rutas de disco (`drawings`) no salen del
  generador, como `files`.
- `dist/web` y `dist/desktop` reciben `assets/<id>/light.svg` y `dark.svg`.
- Módulo web: `svgUrl(id, { theme })` nuevo; `createImage` acepta `theme` y cae al SVG cuando el
  icono no tiene PNG; `url` sigue siendo solo PNG.
- Biblioteca C++: `enum class Theme { light, dark }`, campos `Icon::svg_light` y `Icon::svg_dark`
  (vacíos si no hay SVG) y `resolve_svg(id, theme, library_root)`. `resolve_path` sigue siendo
  solo PNG. Los iconos sin variantes se emiten con un `std::span<const Variant>{}` vacío en lugar
  de un arreglo de tamaño cero, que no es C++ válido.
- Catálogo generado: casilla **Tema oscuro** que muestra el `dark.svg` sobre fondo oscuro; la
  vista previa usa el SVG cuando el icono no tiene PNG.
- GitHub Pages: `index.html` deja de redirigir y enlaza a dos catálogos. El nuevo
  `catalogo-iconos-svg.html`, que genera `tools/catalogo-svg.mjs` (`renderSvgCatalog`, probado),
  contiene solo los iconos vectoriales con los dos temas incrustados como `<symbol>` (el oscuro
  derivado), búsqueda por ID, nombre, ruta y etiquetas, alternancia de tema y botón de copiar el
  ID. El catálogo completo heredado (`catalogo-iconos.html`) se conserva; sus 122 tarjetas de
  iconos migrados muestran el `light.svg` a 24, 48 y 72 px porque sus PNG ya no existen.

### Los 174 dibujos

- **52 de `common.higgs`:** conversión mecánica de los fragmentos vectoriales propios de Higgs
  Skriba y Higgs Presenter (los mismos de los que `--icon-export` sacó los PNG): la rejilla de 16
  pasa al lienzo de 24 con escala 1,25 y margen 2, las posiciones se ajustan a coordenadas «.5» y
  las longitudes a píxeles enteros (trazo de 1 px nítido), el trazo de 1,5 pasa a 1, las líneas
  finas secundarias van en gris `#9499A1`, los acentos medidos (`#18B070`, `#E83020`) pasan a los
  del skill (`#1CB574`, `#EA3323`) y la barra de color de `font-color` y `highlight` se omite como
  en la exportación. Cinco que usaban `<text>` (`font-color`, `clear-format`, `footnote`,
  `watermark`, `text-direction`) se redibujaron a mano con letras trazadas. `table-properties`
  perdió el disco blanco bajo el engranaje: el hueco se hace con geometría.
- **122 heredados** (tablas, páginas, letras, alineaciones, listas, portapapeles, lupas,
  flechas…): dibujos nuevos que representan el mismo concepto que el PNG, sin calcarlo, en seis
  tramos de unos 20, cada uno validado con `iconos_check.py` y revisado en sus hojas a 24 px
  ampliado, 24/48 reales y tema oscuro simulado. A petición del autor, los dos de
  `apps.components.comments-tool.docker` se revisaron frente a sus PNG originales y se
  redibujaron: el resaltador como rotulador macizo con tapa, punta biselada y barra azul, y la
  burbuja con sus líneas de texto.
- Las insignias de añadir y eliminar se dibujan como un solo trazado `fill-rule="evenodd"` y el
  dibujo de debajo deja el hueco de 1 px con su propia geometría (el marco de la tabla se abre en
  esa esquina) **sin máscaras**, porque el intérprete SVG de Skriba y Presenter solo entiende
  `path`, `rect`, `circle`, `ellipse`, `text` y `g`, y porque cairosvg no rasteriza máscaras con
  trazo. Ninguno de los 174 SVG usa `<defs>`, `<mask>` ni `<text>`.
- Los 1218 PNG de esos 174 iconos (24, 30, 36, 42, 48, 60 y 72 px) se borran del inventario por
  orden del autor.

### Decisión de diseño

Se evaluaron tres salidas para los iconos migrados: solo SVG en `dist/` (elegida por el autor),
SVG más PNG rasterizados en cada generación (exigiría Python y cairosvg en toda máquina que ejecute
`tools/build.mjs`, incluidas la CI y las aplicaciones que lo invocan por `FetchContent`; rompe la
regla de cero dependencias) y SVG más PNG derivados confirmados en el repositorio (los PNG no
desaparecerían). Con solo SVG, las aplicaciones que aún piden PNG de un icono migrado reciben
`nullptr`/`null`: Skriba y Presenter dibujan entonces su vectorial propio, así que siguen
funcionando hasta que lean `svg_light`/`svg_dark`.

La variante oscura se deriva al generar en lugar de guardarse como segundo archivo: evita que los
dos dibujos se desincronicen y deja `dark.svg` como anulación opcional para los casos que la
inversión de paleta no resuelva.

## Tipo de Cambio

- `Agregado`: SVG en el inventario, campo `svg`, `svgUrl`, `resolve_svg`, `Theme`, tema oscuro
  del catálogo.
- `Cambiado`: 174 iconos pasan de PNG a SVG; catálogo estático.
- `Removido`: los PNG de esos 174 iconos.

## Archivos Afectados

### [MODIFICADO] `tools/build.mjs`
- `readSvg`, `deriveDarkSvg`, `DARK_PALETTE`, `SVG_THEMES`; `scanDirectory` acepta `light.svg` y
  `dark.svg`; `buildManifest` emite `svg`; `copyPackageAssets` copia o deriva los SVG;
  `desktopHeader`/`desktopSource` con `Theme`, `svg_light`, `svg_dark`, `resolve_svg` y spans
  vacíos de variantes; `build` quita `drawings` del manifiesto.
### [MODIFICADO] `packages/web/index.js`
- `svgUrl`; `createImage` con `theme` y caída al SVG.
### [MODIFICADO] `catalog/index.html`, `catalog/catalog.js`
- Casilla de tema oscuro y vista previa SVG.
### [MODIFICADO] `tests/library.test.mjs`
- Inventario sintético con un icono solo SVG; pruebas de validación (viewBox, `<script>`,
  `<image>`, documento no SVG, `url(` externo, máscara interna admitida, `dark.svg` sin
  `light.svg`), de la derivación oscura, del campo `svg`, de `svgUrl`, de la emisión C++, de la
  anulación con `dark.svg` propio y del catálogo SVG estático.
### [NUEVO] 174 archivos `light.svg` en los directorios `.ico.png` de los iconos de Skriba y Presenter
- 52 en `Common/Higgs/`, 63 en `Common/Res/SharedRes/`, 25 en `Apps/Components/`, 11 en
  `Apps/Public/`, 7 en `Common/Res/TextEngine/`, 5 en `Apps/RasterEditor/`, 3 en
  `Common/Res/GenericUI/`, 2 en `Engines/PrintUI/`, 2 en `Engines/InteropUI/` y 1 en
  `Common/Res/CommonUI/`, `Engines/FusionUI/`, `Engines/NodeFX/` y `Engines/PdfEngine/`.
### [ELIMINADO] 1218 PNG de esos 174 directorios
### [NUEVO] `tools/catalogo-svg.mjs`, `catalogo-iconos-svg.html`
- Generador y catálogo estático de los iconos vectoriales para Pages.
### [MODIFICADO] `index.html`
- Portada con los dos catálogos en lugar de la redirección.
### [MODIFICADO] `catalogo-iconos.html`
- 122 tarjetas apuntan al SVG.
### [MODIFICADO] `package.json`
- 0.1.3 → 0.2.0 con `npm version 0.2.0 --no-git-tag-version`.
### [MODIFICADO] `README.md`, `docs/arquitectura.md`, `docs/manifiesto.md`, `docs/uso-web.md`, `docs/uso-escritorio.md`, `docs/mantenimiento.md`, `RIGHTS-AND-PUBLISHING.md`
- Inventario mixto, contratos nuevos, cómo se añaden iconos SVG, procedencia de los dibujos.

## Verificación

- `node --test`: `# tests 11`, `# pass 11`, `# fail 0`.
- `node tools/build.mjs`: `Built 3001 icons for Web and JUCE Desktop.`; el manifiesto informa
  `libraryVersion` 0.2.0, 174 iconos con `svg` y 2827 con `variants`; `dist/web/assets` y
  `dist/desktop/assets` contienen 348 SVG cada uno.
- Compilación de `dist/desktop` con MSVC 19.44 (Ninja, Release, árbol fuera del proyecto):
  `[2/2] Linking CXX static library higgs_icons.lib`, código 0.
- `iconos_check.py` sobre los 174 SVG: sin errores; avisos declarados en «Impacto».
- `node tools/catalogo-svg.mjs`: `Wrote catalogo-iconos-svg.html with 174 vector icons.` El
  autor lo abrió en el navegador y detectó formas rellenas de negro: los `<symbol>` perdían el
  `fill="none"` de la raíz. Corregido (los símbolos heredan los atributos de presentación de la
  raíz, con prueba de regresión) y comprobado rasterizando tres símbolos en ambos temas.
- Módulo web sobre el manifiesto real (script de Node): `url` de un icono migrado da `null`,
  `svgUrl` da la ruta de `light.svg`/`dark.svg`, y un icono heredado conserva su PNG.
- No se pudo abrir el catálogo en el navegador: `http://localhost/Higgs%20Icons/dist/catalog/`
  responde 404 (el proyecto no está bajo `htdocs`) y la extensión de Chrome no estaba conectada.
- No verificado: la CI de GitHub ni los catálogos de Pages publicados (no se ha hecho commit).

## Impacto

- Ningún ID cambia. El manifiesto conserva `schemaVersion` 1 y todos sus campos; solo añade `svg`.
- Las aplicaciones que piden PNG de un icono migrado reciben `null`/`nullptr` (`url`,
  `nearest_variant`, `resolve_path`): deben pasar a `svgUrl`/`resolve_svg`. Skriba y Presenter
  caen mientras tanto a su vectorial propio.
- `struct Icon` gana dos campos al final; el código que lo inicializa por agregación con los siete
  campos anteriores sigue compilando.
- Avisos del validador aceptados: cobertura de tinta por debajo del 8 % en trazos finos (`fx`,
  cursiva, deshacer, rehacer, signo de interrogación, flechas de contraer y expandir); los 46
  convertidos llevan remates redondos en todo el trazo como el renderizador de Skriba; las letras
  «PDF» de `engines.pdf-engine.pdf` son legibles a 48 y 72 px y justas a 24.
- La variante oscura de los iconos aún en PNG no existe: Skriba sigue tiñendo esos PNG.
- Pendiente para fases siguientes: los 2827 iconos heredados restantes.
