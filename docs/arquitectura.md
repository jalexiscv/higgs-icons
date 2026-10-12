# Arquitectura

Higgs Icons convierte un inventario heredado de iconos PNG en una biblioteca con
identificadores estables que consumen por igual las aplicaciones web y las de
escritorio (JUCE) de Higgs. Todo sale de un único generador; las salidas no se
versionan y se pueden reconstruir en cualquier momento.

## Piezas y flujo

```
 Apps/  Common/  Engines/            inventario fuente (PNG por tamaño)
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

`catalogo-iconos.html` (raíz) es un catálogo estático independiente del
generador; junto con `index.html` y `.nojekyll` es lo que sirve GitHub Pages.

## El inventario

- Un icono es un **directorio** cuyo nombre termina en `.ico.png` y que
  contiene variantes `<tamaño>.png` (hoy 24, 48 y 72 px para los 2949 iconos).
  Los PNG sueltos fuera de un directorio `.ico.png` no forman parte de la
  biblioteca.
- `scanDirectory` recorre `Apps/`, `Common/` y `Engines/`, comprueba la firma
  PNG de cada variante y rechaza tamaños repetidos.
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
| `manifest.json` (`schemaVersion: 1`, `libraryVersion`, `icons[]`) | `build()` en `tools/build.mjs` | Módulo web, catálogo |
| API web: `IconLibrary` (`get`, `findLegacyName`, `url`, `createImage`, `search`) y `loadIconLibrary` | `packages/web/index.js` | Skriba web y demás apps web |
| API C++: `higgs_icons::all`, `find`, `find_legacy`, `nearest_variant`, `resolve_path`, `search` | `desktopHeader()` / `desktopSource()` | Skriba y Odyssey (JUCE) |
| CMake: `HiggsIcons::HiggsIcons`, `higgs_icons_copy_assets(target)` | `desktopCmake()` | Aplicaciones de escritorio |
| Rutas de assets `assets/<id con / >/<tamaño>.png` | `buildManifest` | Web y escritorio |

La referencia de uso de cada contrato está en [uso-web.md](uso-web.md),
[uso-escritorio.md](uso-escritorio.md) y [manifiesto.md](manifiesto.md).

Las implementaciones web y C++ deben comportarse igual: `nearest_variant` y
`url` eligen el tamaño más cercano y, en empate, el mayor; `search` exige que
todos los términos coincidan en ID, nombre, nombre heredado, ruta, alias o
tags; `find_legacy`/`findLegacyName` solo devuelven un resultado único.

## Verificación

- `tests/library.test.mjs` (`node --test`) prueba el generador sobre un
  inventario sintético en el directorio temporal del sistema y el módulo web.
- La CI (`.github/workflows/ci.yml`, `windows-latest`, Node 22) ejecuta las
  pruebas, genera `dist/` y compila `dist/desktop` con CMake.

## Límites conocidos

- `catalogo-iconos.html` no se regenera con `tools/build.mjs`; si cambia el
  inventario, hay que actualizarlo aparte.
- La biblioteca C++ incrusta todo el inventario en `icons.cpp`; no tiene pruebas
  propias en C++ más allá de que compile.
- La biblioteca no declara licencia todavía, y la procedencia de cada grupo está por escribir en
  `RIGHTS-AND-PUBLISHING.md`.
