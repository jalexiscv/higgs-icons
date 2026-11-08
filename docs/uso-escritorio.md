# Uso en aplicaciones de escritorio (C++ y Higgs Mythos)

`dist/desktop/` es un proyecto CMake con una biblioteca estática C++20,
`HiggsIcons::HiggsIcons`, y los archivos de imagen de todos los iconos (PNG por
tamaño o SVG por tema). La biblioteca **no depende de ningún framework**: da los
metadatos y la ruta del archivo; cargar la imagen lo hace la aplicación con
[Higgs Mythos](https://github.com/jalexiscv/higgs-mythos), el framework de las
aplicaciones Higgs, o con lo que use. Cómo añadirla al proyecto está en
[obtener-desde-github.md](obtener-desde-github.md).

## Contenido de `dist/desktop/`

```
dist/desktop/
├── CMakeLists.txt                   ← proyecto higgs_icons (CMake 3.20+)
├── include/higgs_icons/icons.hpp    ← API pública
├── src/icons.cpp                    ← tabla de iconos generada
└── assets/                          ← PNG: assets/<ID con "/">/<tamaño>.png
                                        SVG: assets/<ID con "/">/light.svg y dark.svg
```

Cada icono trae PNG por tamaño (`variants`), dibujo vectorial en tema claro y
oscuro (`svg_light`, `svg_dark`) o ambos. Desde 0.2.1 los 3048 iconos son solo
vectoriales: `variants` está vacío, `nearest_variant` y `resolve_path` devuelven
`nullptr` y una ruta vacía, y se cargan con `resolve_svg`.

## Integración con CMake

```cmake
add_subdirectory(<ruta a dist/desktop> higgs-icons)   # o el bloque FetchContent
target_link_libraries(skriba PRIVATE HiggsIcons::HiggsIcons)
higgs_icons_copy_assets(skriba)
```

- `HiggsIcons::HiggsIcons` añade la ruta de `include/` y exige C++20.
- `higgs_icons_copy_assets(<target>)` añade un paso posterior a la compilación
  del target que copia `assets/` a `<carpeta del ejecutable>/HiggsIcons/assets`.
  Falla en la configuración si el target no existe, así que se llama después de
  `add_executable` o `higgs_add_gui_app`.
- Con MSVC la biblioteca se compila con `/utf-8`.

En tiempo de ejecución, la carpeta `HiggsIcons` junto al ejecutable es la
**raíz de la biblioteca** (`library_root`).

## Referencia de la API

Todo vive en el espacio de nombres `higgs_icons` (`#include <higgs_icons/icons.hpp>`).
Los datos son constantes de la biblioteca: los `std::string_view` y punteros que
devuelve la API son válidos durante toda la ejecución y se pueden leer desde
varios hilos.

### Tipos

```cpp
struct Variant {
    unsigned size;              // 24, 48, 72…
    std::string_view path;      // "assets/apps/components/base-tool/parallel-lines-count/24.png"
};

enum class Theme { light, dark };

struct Icon {
    std::string_view id;
    std::string_view name;
    std::string_view legacy_name;
    std::string_view source;
    std::span<const Variant> variants;          // ordenadas de menor a mayor; vacío si solo hay SVG
    std::span<const std::string_view> aliases;
    std::span<const std::string_view> tags;
    std::string_view svg_light;                 // "assets/common/higgs/eye/light.svg"; vacío si solo hay PNG
    std::string_view svg_dark;                  // "assets/common/higgs/eye/dark.svg"
};
```

`Icon` no incluye `description`, `category` ni `products` del manifiesto web.
Los SVG tienen `viewBox="0 0 24 24"`, trazos de 1 px alineados al píxel y solo
usan `path`, `rect`, `circle`, `ellipse` y `g` (sin máscaras, `<text>` ni
referencias externas), así que los dibuja cualquier intérprete de SVG básico.

### Funciones

| Función | Resultado |
| --- | --- |
| `all()` | Todos los iconos, ordenados por ID |
| `find(id)` | El icono con ese **ID canónico exacto**, o `nullptr`. No acepta alias |
| `find_legacy(name)` | El icono cuyo nombre heredado o alias coincide sin distinguir mayúsculas, solo si es único; si no, `nullptr` |
| `nearest_variant(icon, size)` | El tamaño disponible más cercano; en empate, el mayor |
| `resolve_path(id, size, library_root)` | `library_root / variant.path` del tamaño más cercano, o una ruta vacía si el ID no existe o el icono no tiene PNG |
| `resolve_svg(id, theme, library_root)` | `library_root / svg_light` (o `svg_dark` con `Theme::dark`), o una ruta vacía si el ID no existe o el icono no tiene dibujo vectorial |
| `search(query, limit = 50)` | Iconos en los que aparecen **todas** las palabras de la consulta (en ID, nombre, nombre heredado, ruta, alias o tags), en orden de ID, hasta `limit`. Consulta vacía: los primeros `limit`; `limit` 0: ninguno |

Diferencias con la versión web: `find` no resuelve alias (en web, `get` sí),
`search` no ordena por relevancia sino por ID, y la comparación sin mayúsculas
solo pliega letras ASCII.

## Ejemplo con Higgs Mythos

```cpp
#include <higgs_icons/icons.hpp>
#include <higgs_gui_basics/higgs_gui_basics.h>

higgs::File higgsIconsRoot()
{
    return higgs::File::getSpecialLocation(higgs::File::currentExecutableFile)
        .getParentDirectory()
        .getChildFile("HiggsIcons");
}

higgs::Image loadHiggsIcon(std::string_view id, int size)
{
    const auto* icon = higgs_icons::find(id);
    const auto* variant = icon != nullptr ? higgs_icons::nearest_variant(*icon, static_cast<unsigned>(size))
                                          : nullptr;
    if (variant == nullptr)
        return {};

    // Variant paths always use '/', and IDs are ASCII.
    const auto relative = higgs::String::fromUTF8(variant->path.data(), static_cast<int>(variant->path.size()))
                              .replaceCharacter('/', higgs::File::getSeparatorChar());
    return higgs::ImageCache::getFromFile(higgsIconsRoot().getChildFile(relative));
}
```

Uso en un botón:

```cpp
auto image = loadHiggsIcon("apps.components.base-tool.parallel-lines-count", 24);
button.setImages(false, true, true,
                 image, 1.0f, {},
                 image, 1.0f, {},
                 image, 1.0f, {});
```

Para pantallas de alta densidad, pedir el tamaño físico
(`24 * scaleFactor`) y dibujar la imagen en el tamaño lógico.

Los iconos vectoriales se cargan como `higgs::Drawable` y se dibujan al tamaño
que haga falta, eligiendo el tema de la aplicación:

```cpp
std::unique_ptr<higgs::Drawable> loadHiggsVectorIcon(std::string_view id, bool darkTheme)
{
    const auto path = higgs_icons::resolve_svg(id, darkTheme ? higgs_icons::Theme::dark : higgs_icons::Theme::light,
                                               higgsIconsRoot().getFullPathName().toStdString());
    if (path.empty())
        return nullptr;
    return higgs::Drawable::createFromSVGFile(higgs::File(path.string()));
}
```

## Sin Higgs Mythos

```cpp
#include <higgs_icons/icons.hpp>
#include <filesystem>
#include <iostream>

int main(int, char** argv)
{
    const auto root = std::filesystem::path(argv[0]).parent_path() / "HiggsIcons";
    const auto path = higgs_icons::resolve_path("apps.components.base-tool.parallel-lines-count", 30, root);
    std::cout << path.string() << '\n';   // …/HiggsIcons/assets/…/parallel-lines-count/24.png
}
```

## Distribuir la aplicación

La biblioteca enlazada solo contiene los metadatos; los PNG y los SVG se leen del
disco. El paquete de la aplicación (instalador, ZIP, Flatpak, bundle de macOS)
debe incluir la carpeta `HiggsIcons/assets` **junto al ejecutable**, con la misma
estructura que deja `higgs_icons_copy_assets`. Con `install()` de CMake:

```cmake
install(TARGETS skriba RUNTIME DESTINATION .)
install(DIRECTORY "${higgs_icons_SOURCE_DIR}/dist/desktop/assets" DESTINATION HiggsIcons)
```

Si la aplicación instala los recursos en otra carpeta (por ejemplo
`share/skriba` en Linux), basta con pasar esa carpeta como `library_root`.
