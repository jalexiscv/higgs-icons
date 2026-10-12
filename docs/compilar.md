# Compilar

## Requisitos comunes

- CMake 3.25 o superior
- Ninja
- Un compilador con C++20: GCC 12+, Clang 15+ o Visual Studio 2022 (MSVC 19.3x+)
- Conexión a internet en la primera configuración: CMake descarga JUCE
  (`cmake/SkribaJuce.cmake`) y Catch2 (`tests/CMakeLists.txt`). Para compilar sin
  red, pasa `-DFETCHCONTENT_SOURCE_DIR_JUCE=/ruta/a/JUCE` y
  `-DFETCHCONTENT_SOURCE_DIR_CATCH2=/ruta/a/Catch2`.
- Solo el motor (modelo, maquetación, edición y ortografía, sin JUCE):
  `-DSKRIBA_ENGINE_ONLY=ON`. Compila en segundos y no descarga JUCE.

Los presets de `CMakePresets.json` dejan el árbol de compilación en
`build/<preset>/`.

## Linux

Paquetes en Debian y Ubuntu:

```sh
sudo apt install build-essential clang cmake ninja-build \
  libfreetype-dev libfontconfig1-dev \
  libx11-dev libxcomposite-dev libxcursor-dev libxext-dev \
  libxinerama-dev libxrandr-dev libxrender-dev libxi-dev \
  libglu1-mesa-dev mesa-common-dev libegl-dev
```

En Fedora: `freetype-devel
fontconfig-devel libX11-devel libXcomposite-devel libXcursor-devel
libXext-devel libXinerama-devel libXrandr-devel libXrender-devel
libXi-devel mesa-libGLU-devel mesa-libEGL-devel`.

```sh
cmake --preset linux-gcc-release        # o linux-clang-release
cmake --build --preset linux-gcc-release
ctest --preset linux-gcc-release
./build/linux-gcc-release/src/ui/skriba_artefacts/Release/Skriba
./build/linux-gcc-release/tools/skriba-cli/skriba-cli_artefacts/Release/skriba-cli info documento.docx
```

Las fuentes métricamente compatibles con las de Office (Carlito, Caladea,
Liberation/Arimo, Tinos, Cousine) hacen que la paginación se parezca a la de
Word. En Debian y Ubuntu: `sudo apt install fonts-crosextra-carlito
fonts-crosextra-caladea fonts-liberation2`. Para probar la exportación desde la
terminal:

```sh
skriba-cli new prueba.docx --text "Hola, mundo"
skriba-cli convert prueba.docx prueba.pdf
skriba-cli info prueba.docx
```

### Flatpak

```sh
flatpak install flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08
flatpak-builder --user --install --force-clean build-flatpak packaging/flatpak/co.com.eduxfuturo.Skriba.yml
flatpak run co.com.eduxfuturo.Skriba
```

## Windows

1. Instala Visual Studio 2022 o las *Build Tools* con la carga de trabajo
   "Desarrollo para el escritorio con C++". Con winget:

   ```powershell
   winget install Kitware.CMake Ninja-build.Ninja
   winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
   ```

2. Abre una consola *x64 Native Tools Command Prompt for VS 2022* (o ejecuta
   `vcvars64.bat`) para que `cl` esté en el PATH, y luego:

   ```powershell
   cmake --preset windows-msvc-release
   cmake --build --preset windows-msvc-release
   ctest --preset windows-msvc-release
   .\build\windows-msvc-release\src\ui\skriba_artefacts\Release\Skriba.exe
   ```

3. Instalador: con [NSIS](https://nsis.sourceforge.io/) instalado,
   `cpack -C Release` dentro de `build/windows-msvc-release` genera
   `skriba-<versión>-Windows-AMD64.exe` y un ZIP portable.

## Releases

Cada cambio se entrega como un release nuevo con el siguiente número de parche
(`2.1.0` → `2.1.1`). En Windows, `tools/release/release.ps1` sube la versión de
`CMakeLists.txt`, compila, ejecuta las pruebas y deja el instalador y el ZIP en
`dist/`:

```powershell
powershell -ExecutionPolicy Bypass -File tools/release/release.ps1 -Notes "Resumen del release en inglés"
```

Las reglas de numeración están en
[protocols/Releases.md](protocols/Releases.md).

## Opciones de CMake

| Opción | Por defecto | Efecto |
| --- | --- | --- |
| `SKRIBA_BUILD_APP` | ON | Compila la aplicación de escritorio |
| `SKRIBA_BUILD_CLI` | ON | Compila `skriba-cli` |
| `SKRIBA_BUILD_TESTS` | ON | Compila las pruebas |
| `SKRIBA_WARNINGS_AS_ERRORS` | OFF (ON en CI) | Avisos como errores |
| `SKRIBA_ENABLE_LTO` | OFF | Optimización en tiempo de enlace |
| `SKRIBA_ENGINE_ONLY` | OFF | Solo el motor, sin JUCE (sin aplicación ni CLI) |
| `SKRIBA_JUCE_VERSION` | 9.0.3 | Etiqueta de JUCE a descargar |
