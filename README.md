# Higgs Icons

Biblioteca común de iconos para Skriba, Odyssey y Presenter, con dos salidas generadas desde el mismo inventario:

- **Web:** módulo ES compatible con JavaScript vanilla y recursos PNG.
- **Desktop:** biblioteca C++20 y CMake compatible con las aplicaciones JUCE de Skriba y Odyssey.

Los directorios `Apps/`, `Common/` y `Engines/` se conservan como fuente de los recursos heredados. Las aplicaciones deben usar los IDs del manifiesto, no depender de esas rutas.

## Requisitos y comandos

Requiere Node.js 20 o superior. No necesita dependencias externas.

```powershell
node --test
node tools/build.mjs
```

La salida se genera en `dist/` y se puede reconstruir en cualquier momento. No se versiona. Para regenerar, se reemplazan únicamente `dist/web/`, `dist/desktop/` y `dist/catalog/`.

## IDs y metadatos

`metadata/ids.json` es el registro canónico de IDs, indexado por ruta de origen. Así los consumidores usan identificadores que no cambian si más adelante se reorganizan las carpetas. En la primera instalación se inicializa una vez con IDs formados a partir de las rutas heredadas:

```powershell
node tools/build.mjs --initialize-ids
```

El comando se niega a sobrescribir un registro existente. Los IDs iniciales usan namespace y nombre heredado, normalizados a minúsculas y separados por puntos; las carpetas de recursos `RcBin`, `RCBin`, `rcBin` y `Res` no forman parte del ID. Por ejemplo:

```text
Apps/Components/BaseTool/RCBin/parallel_lines_count.ico.png
apps.components.base-tool.parallel-lines-count
```

Cada entrada del manifiesto conserva `source` y `legacyName`; los IDs antiguos no se pierden. Para reorganizar un recurso se actualiza su clave en `metadata/ids.json` manteniendo el mismo valor ID. `metadata/overrides.json` permite agregar nombres comprensibles, descripciones, alias, etiquetas y disponibilidad por producto sin renombrar los archivos:

```json
{
  "icons": {
    "apps.components.base-tool.parallel-lines-count": {
      "name": "Contar líneas paralelas",
      "description": "Acción para contar líneas paralelas.",
      "aliases": ["parallel-lines-count"],
      "tags": ["líneas", "medición"],
      "products": ["skriba-web", "skriba-desktop"]
    }
  }
}
```

Los campos `name`, `description`, `aliases`, `tags` y `products` son opcionales. Los tags generados automáticamente incluyen términos normalizados del ID y del nombre. Para que una acción concreta sea fácil de localizar, se recomienda curar `name`, `description` y `tags` de sus iconos principales; el resto sigue siendo encontrable por ID, nombre heredado y ruta.

## Web

Copiar `dist/web/` a una ruta pública de la aplicación, por ejemplo `public/assets/higgs-icons/`. No requiere bundler:

```js
import { loadIconLibrary } from '/assets/higgs-icons/index.js';

const icons = await loadIconLibrary();
const image = icons.createImage('apps.components.base-tool.parallel-lines-count', {
  size: 24,
  alt: 'Contar líneas paralelas',
});
document.querySelector('#toolbar').append(image);

const matches = icons.search('líneas paralelas', { limit: 20 });
```

`url(id, { size })` elige la variante disponible más cercana; si hay empate prefiere la de mayor resolución. `get(id)` acepta ID o alias no ambiguo. `findLegacyName(name)` solo devuelve un resultado si el nombre heredado es único. Las rutas usan URL relativas al módulo para permitir alojar la biblioteca bajo cualquier prefijo.

## Desktop JUCE

Copiar `dist/desktop/` a una ubicación versionada o compartida y agregarla desde el CMake de la aplicación:

```cmake
add_subdirectory(path/to/higgs-icons higgs-icons)
target_link_libraries(skriba PRIVATE HiggsIcons::HiggsIcons)
higgs_icons_copy_assets(skriba)
```

La función copia los recursos a `HiggsIcons/assets` junto al ejecutable. Pasar esa carpeta `HiggsIcons` como `library_root`:

```cpp
const auto path = higgs_icons::resolve_path(
    "apps.components.base-tool.parallel-lines-count", 24, library_root);
const auto image = juce::ImageCache::getFromFile(juce::File(path.string()));
```

`find(id)` devuelve metadatos, `nearest_variant(icon, size)` el tamaño disponible más cercano, `resolve_path(...)` la ruta física y `search(query)` permite búsqueda por ID, nombre, alias, etiquetas y ruta. La biblioteca C++ es independiente de JUCE; JUCE solo se usa en el ejemplo de carga.

## Catálogo

Tras ejecutar el generador, el catálogo navegable está en `dist/catalog/`. Desde XAMPP:

```text
http://localhost/Higgs%20Icons/dist/catalog/
```

Permite buscar por ID, nombre, alias y ruta, y copiar el ID canónico. Se genera con el mismo manifiesto que consumen Web y Desktop.

## Verificación

El generador comprueba firmas PNG, colisiones de IDs, overrides desconocidos y estructura de metadatos. Las pruebas unitarias se ejecutan con `node --test`; el ciclo completo es:

```powershell
node --test
node tools/build.mjs
```

## Publicación

Antes de publicar el repositorio o las salidas, completar la revisión de [derechos y publicación](RIGHTS-AND-PUBLISHING.md). Este proyecto todavía no declara una licencia: no se debe inferir permiso de redistribución a partir de que los recursos estén presentes localmente.