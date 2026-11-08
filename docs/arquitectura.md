# Arquitectura

Higgs Icons convierte un inventario de dibujos SVG en una biblioteca con identificadores estables que consumen por igual las
aplicaciones web y las de escritorio (Higgs Mythos) de Higgs. Todo sale de un único
generador; las salidas no se versionan y se pueden reconstruir en cualquier
momento.

## Piezas y flujo

```
 Apps/  Common/  Engines/            inventario fuente (light.svg o PNG por tamaño)
            │
 metadata/ids.json                   ruta de origen → ID canónico
 metadata/overrides.json             nombre, descripción, alias, tags, productos
 package.json (version)              versión de la biblioteca
            │
            ▼
   tools/build.mjs  ──────────────►  dist/web/       manifest.json + index.js + assets/
   (buildManifest, build)  ───────►  dist/desktop/   icons.hpp + icons.cpp + CMakeLists.txt + assets/
                           ───────►  dist/catalog/   catalog/index.html + catalog.js
```

GitHub Pages sirve la raíz (`index.html`, `.nojekyll` y dos catálogos
estáticos): `catalogo-iconos-svg.html`, que genera `tools/catalogo-svg.mjs`
(`renderSvgCatalog`) con solo los iconos vectoriales y sus dos temas incrustados
como `<symbol>`, y `catalogo-iconos.html`, el catálogo completo heredado,
independiente del generador.

## El inventario

- Un icono es un **directorio** cuyo nombre termina en `.ico.png` (el nombre se
  conserva aunque el contenido sea SVG: `source` y `legacyName` son contrato) y
  que contiene un dibujo vectorial `light.svg`, variantes `<tamaño>.png` o
  ambos durante una migración. Desde 0.2.1 los 3048 iconos son solo SVG; el
  generador sigue aceptando PNG por tamaño (cualquier conjunto de tamaños) por
  compatibilidad, pero el inventario ya no tiene ninguno. Los archivos sueltos
  fuera de un directorio `.ico.png` (por ejemplo los 19 PNG de plantillas y
  maquetaciones en `Apps/Public/Res/DrawCore/` y `Common/Res/CommonUI/`) no
  forman parte de la biblioteca.
- El SVG tiene `viewBox="0 0 24 24"`, se dibuja con trazos de 1 px alineados al
  píxel según el skill `iconos-svg-ui` y sirve a 24, 30, 36, 42, 48, 60, 72 y
  128 px. Solo usa `path`, `rect`, `circle`, `ellipse` y `g`, sin máscaras ni
  `<text>`, para que lo interprete el renderizador de subconjunto SVG de las
  aplicaciones. El dibujo oscuro se deriva al generar (`deriveDarkSvg`,
  `DARK_PALETTE`: tinta `#2E3238` → `#E6E9EF`, gris `#9499A1` → `#80868F`;
  acentos iguales) salvo que el directorio traiga un `dark.svg` propio.
- `scanDirectory` recorre `Apps/`, `Common/` y `Engines/`, comprueba la firma
  PNG de cada variante, rechaza tamaños repetidos y valida cada SVG
  (`readSvg`: documento `<svg>` de hasta 256 KiB con `viewBox="0 0 24 24"`, sin
  `<script>`, `<style>`, `<image>`, `<use>`, `<foreignObject>`, `<a>`, `href`
  ni `url(` externo); un `dark.svg` sin `light.svg` detiene la generación.
- Las carpetas de recursos `RcBin`, `RCBin`, `rcBin` y `Res` no forman parte
  del ID (`RESOURCE_BUCKETS`).

## IDs canónicos

- `metadata/ids.json` es el registro canónico, indexado por la ruta de origen
  (`source`). El generador falla si el registro menciona rutas que no existen o
  si falta alguna ruta del inventario: un icono nuevo exige su entrada.
- Los IDs iniciales se formaron con `normalizeSegment` a partir de la ruta
  (`Apps/Components/BaseTool/RCBin/parallel_lines_count.ico.png` →
  `apps.components.base-tool.parallel-lines-count`) mediante
  `node tools/build.mjs --initialize-ids`, que se niega a sobrescribir un
  registro existente.
- Un ID publicado no cambia: para reorganizar un recurso se cambia la clave y
  se conserva el valor. Las colisiones de ID detienen la generación.

## Metadatos curados

`metadata/overrides.json` admite por ID solo `name`, `description`, `aliases`,
`tags` y `products`; cualquier otra clave, un ID desconocido o un tipo que no
sea arreglo detienen la generación. Los tags finales unen los términos del ID y
del nombre con los curados.

## Contratos con los consumidores

| Contrato | Dónde se define | Consumidores |
| --- | --- | --- |
| IDs canónicos | `metadata/ids.json` | Todas las aplicaciones |
| `manifest.json` (`schemaVersion: 1`, `libraryVersion`, `icons[]` con `variants` y `svg`) | `build()` en `tools/build.mjs` | Módulo web, catálogo |
| API web: `IconLibrary` (`get`, `findLegacyName`, `url`, `svgUrl`, `createImage`, `search`) y `loadIconLibrary` | `packages/web/index.js` | Skriba web y demás apps web |
| API C++: `higgs_icons::all`, `find`, `find_legacy`, `nearest_variant`, `resolve_path`, `resolve_svg`, `search`; `Theme`; `Icon::svg_light`, `svg_dark` | `desktopHeader()` / `desktopSource()` | Skriba, Odyssey y Presenter (Higgs Mythos) |
| CMake: `HiggsIcons::HiggsIcons`, `higgs_icons_copy_assets(target)` | `desktopCmake()` | Aplicaciones de escritorio |
| Rutas de assets `assets/<id con / >/<tamaño>.png` y `assets/<id con / >/<light|dark>.svg` | `buildManifest` | Web y escritorio |

La referencia de uso de cada contrato está en [uso-web.md](uso-web.md),
[uso-escritorio.md](uso-escritorio.md) y [manifiesto.md](manifiesto.md).

Las implementaciones web y C++ deben comportarse igual: `nearest_variant` y
`url` eligen el tamaño más cercano y, en empate, el mayor, solo entre los PNG;
`resolve_svg` y `svgUrl` dan el SVG del tema pedido o nada; `search` exige que
todos los términos coincidan en ID, nombre, nombre heredado, ruta, alias o
tags; `find_legacy`/`findLegacyName` solo devuelven un resultado único. El único
atajo propio de la web es `createImage`, que cae al SVG claro u oscuro cuando el
icono no tiene PNG.

## Verificación

- `tests/library.test.mjs` (`node --test`) prueba el generador sobre un
  inventario sintético en el directorio temporal del sistema y el módulo web.
- La CI (`.github/workflows/ci.yml`, `windows-latest`, Node 22) ejecuta las
  pruebas, genera `dist/` y compila `dist/desktop` con CMake.

## Límites conocidos

- `catalogo-iconos.html` no se regenera con ninguna herramienta; si cambia el
  inventario, hay que actualizarlo aparte. Muestra el `light.svg` de los iconos
  heredados migrados y no incluye `Common/Higgs/`. El catálogo SVG sí se
  regenera (`node tools/catalogo-svg.mjs`), pero no forma parte de
  `tools/build.mjs` ni de `dist/`.
- Los dibujos de los iconos heredados son nuevos (0.2.1): representan el concepto
  del PNG original sin calcarlo, así que algunos simplifican detalles que a 24 px
  no se leían. El PNG original de cada uno sigue en el historial de Git.
- La biblioteca C++ incrusta todo el inventario en `icons.cpp`; no tiene pruebas
  propias en C++ más allá de que compile.
- La licencia es privativa (`LICENSE`, `LicenseRef-EduxFuturo-Proprietary`); la procedencia de los
  grupos heredados está por escribir en `RIGHTS-AND-PUBLISHING.md`.
