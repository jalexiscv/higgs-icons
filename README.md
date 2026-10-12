# Higgs Icons

Biblioteca común de iconos de las aplicaciones Higgs (Skriba, Odyssey y
Presenter). Un solo inventario de 2949 iconos PNG, en 24, 48 y 72 px, con
**identificadores estables**, del que se generan dos salidas:

- **Web:** módulo ES sin dependencias ni bundler, para JavaScript vanilla, PHP o
  cualquier aplicación web.
- **Escritorio:** biblioteca C++20 con CMake, independiente de JUCE y lista para
  las aplicaciones JUCE de Skriba y Odyssey.

**Catálogo en línea:** [jalexiscv.github.io/higgs-icons](https://jalexiscv.github.io/higgs-icons/)

## Cómo se usa

Las aplicaciones nombran los iconos por su **ID canónico**, que no cambia
aunque los archivos se reorganicen:

```text
apps.components.base-tool.parallel-lines-count
```

Cada proyecto toma una versión fija del repositorio (`vX.Y.Z`), genera `dist/`
con Node.js 20+ y usa la salida que le corresponde. La guía completa, con
`FetchContent`, submódulos y scripts de copia, está en
[docs/obtener-desde-github.md](docs/obtener-desde-github.md).

### Aplicación web

```powershell
git clone --depth 1 --branch v0.1.0 https://github.com/jalexiscv/higgs-icons.git
node higgs-icons/tools/build.mjs
# copiar higgs-icons/dist/web/ a la carpeta pública, p. ej. public/assets/higgs-icons/
```

```js
import { loadIconLibrary } from '/assets/higgs-icons/index.js';

const icons = await loadIconLibrary();
document.querySelector('#toolbar').append(
  icons.createImage('apps.components.base-tool.parallel-lines-count', { size: 24, alt: 'Contar líneas' }),
);
```

API y recetas: [docs/uso-web.md](docs/uso-web.md).

### Aplicación de escritorio (CMake / JUCE)

```cmake
include(FetchContent)
FetchContent_Declare(higgs_icons
    GIT_REPOSITORY https://github.com/jalexiscv/higgs-icons.git
    GIT_TAG        v0.1.0
    GIT_SHALLOW    TRUE)
FetchContent_MakeAvailable(higgs_icons)

find_program(NODE_EXECUTABLE node REQUIRED)
execute_process(COMMAND "${NODE_EXECUTABLE}" tools/build.mjs
                WORKING_DIRECTORY "${higgs_icons_SOURCE_DIR}"
                COMMAND_ERROR_IS_FATAL ANY)
add_subdirectory("${higgs_icons_SOURCE_DIR}/dist/desktop" "${CMAKE_BINARY_DIR}/higgs-icons")

target_link_libraries(skriba PRIVATE HiggsIcons::HiggsIcons)
higgs_icons_copy_assets(skriba)   # copia los PNG a <ejecutable>/HiggsIcons/assets
```

```cpp
#include <higgs_icons/icons.hpp>

const auto path = higgs_icons::resolve_path(
    "apps.components.base-tool.parallel-lines-count", 24, executableDir / "HiggsIcons");
```

API, ejemplo con JUCE y empaquetado: [docs/uso-escritorio.md](docs/uso-escritorio.md).

> En Windows, activa una vez `git config --global core.longpaths true` o usa una
> carpeta de compilación corta: algunas rutas del repositorio son largas
> ([detalles](docs/obtener-desde-github.md#rutas-largas-en-windows)).

### Encontrar un icono

- En el [catálogo en línea](https://jalexiscv.github.io/higgs-icons/) se busca
  por nombre o ruta; **Copiar ruta** da la ruta heredada, cuyo ID está en
  [metadata/ids.json](metadata/ids.json).
- El catálogo generado (`dist/catalog/`, tras `node tools/build.mjs`) muestra y
  copia directamente el ID canónico.
- Desde código: `icons.search('parallel lines')` o
  `higgs_icons::search("parallel lines")`.

## Versiones

Las versiones siguen [Versionado Semántico](https://semver.org/lang/es/) y se
publican como etiquetas `vX.Y.Z`. Los parches añaden iconos o metadatos sin
romper nada; los IDs publicados no cambian. Los cambios de cada versión están en
[changelogs/](changelogs/CHANGELOG.md).

## Documentación

| Documento | Contenido |
| --- | --- |
| [docs/obtener-desde-github.md](docs/obtener-desde-github.md) | Cómo incorporar la biblioteca a un proyecto desde GitHub: versiones, `FetchContent`, submódulo, scripts de copia, problemas frecuentes |
| [docs/uso-web.md](docs/uso-web.md) | API JavaScript (`loadIconLibrary`, `IconLibrary`) y recetas |
| [docs/uso-escritorio.md](docs/uso-escritorio.md) | API C++ (`higgs_icons`), CMake, ejemplo con JUCE y distribución de la aplicación |
| [docs/manifiesto.md](docs/manifiesto.md) | Formato de `manifest.json` y sus garantías |
| [docs/mantenimiento.md](docs/mantenimiento.md) | Añadir iconos, registrar IDs, curar nombres y publicar una versión |
| [docs/arquitectura.md](docs/arquitectura.md) | Inventario, IDs canónicos, generador, salidas y contratos con las aplicaciones |
| [docs/estilo-de-codigo.md](docs/estilo-de-codigo.md) | Estilo de JavaScript, C++ generado, datos, pruebas y commits |
| [docs/protocols/Releases.md](docs/protocols/Releases.md) | Numeración de versiones |
| [docs/protocols/Changelogs.md](docs/protocols/Changelogs.md) | Registro de cambios en [changelogs/](changelogs/CHANGELOG.md) |
| [docs/protocols/Documentations.md](docs/protocols/Documentations.md) | Mantenimiento de la documentación |
| [docs/protocols/Fable/](docs/protocols/Fable/Execution.md) | Protocolos de trabajo de los agentes de IA (ejecución, depuración, decisiones, revisión, seguridad, continuidad) |
| [RIGHTS-AND-PUBLISHING.md](RIGHTS-AND-PUBLISHING.md) | Procedencia, derechos y publicación |

## Desarrollo

Requiere Node.js 20 o superior; no hay dependencias de npm.

```powershell
node --test            # pruebas
node tools/build.mjs   # genera dist/web, dist/desktop y dist/catalog
```

`dist/` no se versiona y se puede reconstruir en cualquier momento. Cómo añadir
iconos y publicar versiones: [docs/mantenimiento.md](docs/mantenimiento.md).

## Derechos

La biblioteca es material propio del autor y se puede usar y distribuir: es la fuente de iconos de
la familia Higgs ([derechos y publicación](RIGHTS-AND-PUBLISHING.md)). Lo que falta es **declarar
la licencia** —hoy no hay ninguna, ni para el código ni para las imágenes— y escribir la
procedencia de cada grupo.
