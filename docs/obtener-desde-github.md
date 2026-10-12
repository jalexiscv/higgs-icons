# Obtener la biblioteca desde GitHub

Higgs Icons se distribuye desde su repositorio de GitHub,
[`jalexiscv/higgs-icons`](https://github.com/jalexiscv/higgs-icons). Cada
proyecto consumidor (Skriba web, Skriba de escritorio, Odyssey, Presenter) toma
una **versión fija** del repositorio, genera las salidas con Node.js y usa la que
le corresponde: `dist/web/` en las aplicaciones web y `dist/desktop/` en las de
escritorio.

`dist/` no se guarda en el repositorio: se genera en el proyecto consumidor con
`node tools/build.mjs`. Por eso todos los métodos de esta guía necesitan Node.js 20
o superior en la máquina (o en la CI) que compila el proyecto consumidor. El
generador no tiene dependencias de npm: no hace falta `npm install`.

## Elegir la versión

- Las versiones siguen [Versionado Semántico](https://semver.org/lang/es/) y se
  publican como etiquetas de Git `vX.Y.Z` (por ejemplo `v0.1.0`).
- **Fija siempre una etiqueta**, nunca `main`: así todos los desarrolladores y la
  CI del proyecto consumidor usan exactamente los mismos iconos e IDs. Si una
  versión todavía no tiene etiqueta, fija el hash completo del commit.
- La versión que estás usando aparece en `libraryVersion` de
  `dist/web/manifest.json`.

Qué esperar al actualizar:

| Cambio de versión | Qué puede cambiar | Qué hacer |
| --- | --- | --- |
| Parche (`0.1.0` → `0.1.1`) | Iconos nuevos, nombres y tags curados, correcciones | Actualizar sin cambios de código |
| Menor (`0.1.x` → `0.2.0`) | Funciones o campos nuevos; mientras la versión sea `0.x`, también cambios incompatibles | Leer el changelog antes de actualizar |
| Mayor (`1.x` → `2.0.0`) | Cambios incompatibles en IDs, manifiesto o APIs | Leer el changelog y adaptar el código |

Los IDs canónicos no cambian entre versiones; si alguno llegara a retirarse, sería
un cambio incompatible anunciado en [changelogs/](../changelogs/CHANGELOG.md).

## Método 1 — CMake con `FetchContent` (escritorio)

Es la forma recomendada para Skriba y Odyssey: CMake descarga la versión, la
genera y la añade al proyecto en el paso de configuración.

```cmake
include(FetchContent)
FetchContent_Declare(higgs_icons
    GIT_REPOSITORY https://github.com/jalexiscv/higgs-icons.git
    GIT_TAG        v0.1.0
    GIT_SHALLOW    TRUE)
FetchContent_MakeAvailable(higgs_icons)

# The repository ships sources only; generate dist/ with Node.js.
find_program(NODE_EXECUTABLE node REQUIRED)
execute_process(COMMAND "${NODE_EXECUTABLE}" tools/build.mjs
                WORKING_DIRECTORY "${higgs_icons_SOURCE_DIR}"
                COMMAND_ERROR_IS_FATAL ANY)
add_subdirectory("${higgs_icons_SOURCE_DIR}/dist/desktop" "${CMAKE_BINARY_DIR}/higgs-icons")

target_link_libraries(skriba PRIVATE HiggsIcons::HiggsIcons)
higgs_icons_copy_assets(skriba)
```

- Requiere CMake 3.20 o superior (lo exige `dist/desktop/CMakeLists.txt`) y
  Node.js 20+.
- `FetchContent_MakeAvailable` solo descarga: la raíz del repositorio no tiene
  `CMakeLists.txt`, el proyecto CMake es `dist/desktop` y existe después de
  `execute_process`.
- La generación se repite en cada configuración y tarda unos segundos; la primera
  configuración, con la descarga, tarda alrededor de medio minuto.
- Para cambiar de versión basta con cambiar `GIT_TAG` y volver a configurar.
- En Windows, ver [Rutas largas en Windows](#rutas-largas-en-windows).

El uso de la biblioteca en C++ está en [uso-escritorio.md](uso-escritorio.md).

## Método 2 — Submódulo de Git (escritorio o web)

Útil cuando el proyecto consumidor quiere el repositorio dentro de su árbol:

```powershell
git submodule add https://github.com/jalexiscv/higgs-icons.git third_party/higgs-icons
git -C third_party/higgs-icons checkout v0.1.0
git add .gitmodules third_party/higgs-icons
git commit -m "build: incorpora Higgs Icons v0.1.0"
```

Quien clone el proyecto consumidor necesita `git clone --recurse-submodules` (o
`git submodule update --init`). Después:

- **Escritorio:** el mismo bloque `execute_process` + `add_subdirectory` del
  método 1, con `WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}/third_party/higgs-icons"`.
- **Web:** `node third_party/higgs-icons/tools/build.mjs` y copiar
  `third_party/higgs-icons/dist/web/` a la carpeta pública (método 3).

Para actualizar: `git -C third_party/higgs-icons fetch --tags`, `checkout` de la
etiqueta nueva y commit del submódulo en el proyecto consumidor.

## Método 3 — Copiar `dist/web` en una aplicación web

Las aplicaciones web (incluidas las de PHP servidas con XAMPP o Apache) solo
necesitan la carpeta `dist/web/` copiada en su ruta pública. Este script la
descarga, la genera y la copia; se guarda en el proyecto consumidor y se vuelve a
ejecutar para cada actualización.

PowerShell (Windows):

```powershell
$version = 'v0.1.0'
$destino = 'public/assets/higgs-icons'
$temporal = Join-Path ([IO.Path]::GetTempPath()) "higgs-icons-$version"

if (Test-Path $temporal) { Remove-Item $temporal -Recurse -Force }
git clone --depth 1 --branch $version https://github.com/jalexiscv/higgs-icons.git $temporal
node (Join-Path $temporal 'tools/build.mjs')
if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar Higgs Icons.' }
if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
Copy-Item (Join-Path $temporal 'dist/web') $destino -Recurse
Remove-Item $temporal -Recurse -Force
```

Bash (Linux, macOS, Git Bash):

```sh
version=v0.1.0
destino=public/assets/higgs-icons
temporal="$(mktemp -d)"

git clone --depth 1 --branch "$version" https://github.com/jalexiscv/higgs-icons.git "$temporal"
node "$temporal/tools/build.mjs"
rm -rf "$destino"
mkdir -p "$(dirname "$destino")"
cp -R "$temporal/dist/web" "$destino"
rm -rf "$temporal"
```

La carpeta copiada pesa unos 15 MB (tres tamaños de cada icono). Decide en el
proyecto consumidor si se versiona allí o se regenera en su despliegue.

El uso de la biblioteca en JavaScript está en [uso-web.md](uso-web.md).

## Método 4 — Descargar el ZIP de una versión

Sin Git: en GitHub, **Code → Download ZIP** (o la página de la etiqueta), y
luego `node tools/build.mjs` dentro de la carpeta descomprimida. El resultado es
el mismo `dist/` de los métodos anteriores.

## Encontrar el ID de un icono

Las aplicaciones siempre usan el **ID canónico**
(`apps.components.base-tool.parallel-lines-count`), nunca la ruta del archivo.

- **Catálogo generado** (`dist/catalog/`, tras `node tools/build.mjs`): busca por
  ID, nombre, alias o ruta, y su botón **Copiar ID** copia el ID canónico. Con
  XAMPP: `http://localhost/Higgs%20Icons/dist/catalog/`.
- **Catálogo publicado en GitHub Pages:**
  [jalexiscv.github.io/higgs-icons](https://jalexiscv.github.io/higgs-icons/).
  Es una vista estática del inventario: su botón **Copiar ruta** copia la ruta
  heredada (`Apps/Components/BaseTool/RCBin/parallel_lines_count.ico.png`). El ID
  es el valor de esa ruta en
  [metadata/ids.json](../metadata/ids.json). Incluye además algunos PNG sueltos
  que no forman parte de la biblioteca.
- **Desde código:** `search('parallel lines')` en web o
  `higgs_icons::search("parallel lines")` en C++. Hoy los nombres y tags salen
  del nombre heredado, en inglés; los términos en español funcionan para los
  iconos que tengan nombre o tags curados en `metadata/overrides.json`.

## Rutas largas en Windows

Las rutas del repositorio llegan a 100 caracteres
(`Apps/Components/CommentsTool/Docker/RCBin/…ico.png/72.png`). Git en Windows no
crea archivos cuya ruta completa supere los 260 caracteres, y el clonado falla
con:

```text
fatal: cannot create directory at 'Apps/Components/CommentsTool/…': Filename too long
```

Con `FetchContent` la ruta completa es `<carpeta de compilación>/_deps/higgs_icons-src/`
más esos 100 caracteres, así que la carpeta de compilación debe medir menos de
unos 130 caracteres. Hay dos soluciones:

- Activar las rutas largas de Git una vez por máquina (también en la CI):
  `git config --global core.longpaths true`. Node.js y CMake manejan bien el resto
  del proceso.
- O usar carpetas cortas: compilar en `C:\src\skriba\build` o fijar
  `-DFETCHCONTENT_BASE_DIR=C:/deps` al configurar.

## Integración continua del proyecto consumidor

La CI que compila el proyecto consumidor necesita Git, Node.js 20+ y, en
escritorio, CMake. En GitHub Actions:

```yaml
- run: git config --global core.longpaths true   # solo en runners de Windows
- uses: actions/setup-node@v4
  with:
    node-version: 22
```

## Problemas frecuentes

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `Filename too long` al clonar (Windows) | Ruta completa de más de 260 caracteres | Ver [Rutas largas en Windows](#rutas-largas-en-windows) |
| `Could not find NODE_EXECUTABLE` al configurar | Node.js no está en el `PATH` | Instalar Node.js 20+ o pasar `-DNODE_EXECUTABLE=<ruta>` |
| `ID registry is missing sources: …` | La versión descargada tiene el inventario y el registro desincronizados | Usar una etiqueta publicada, no un commit intermedio |
| `execute_process` falla al configurar | El generador de Node detectó un problema | Leer el mensaje de Node que aparece justo antes |
| Iconos que no aparecen en tiempo de ejecución (escritorio) | Falta `higgs_icons_copy_assets(<target>)` o el instalador no incluye `HiggsIcons/` | Ver [uso-escritorio.md](uso-escritorio.md) §Distribuir la aplicación |
| `Unable to load icon manifest (404)` (web) | `index.js` y `manifest.json` no están en la misma carpeta pública | Copiar `dist/web/` completa, sin reorganizarla |
