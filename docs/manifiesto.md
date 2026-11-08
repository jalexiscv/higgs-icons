# Formato del manifiesto

`dist/web/manifest.json` describe todos los iconos de una versión. Lo genera
`tools/build.mjs` a partir del inventario y de `metadata/`; lo consumen el módulo
web y el catálogo, y la biblioteca C++ incrusta los mismos datos en `icons.cpp`.

## Estructura

```json
{
  "schemaVersion": 1,
  "libraryVersion": "0.1.0",
  "icons": [
    {
      "id": "apps.components.base-tool.parallel-lines-count",
      "name": "parallel lines count",
      "description": "",
      "category": "apps.components.base-tool",
      "source": "Apps/Components/BaseTool/RCBin/parallel_lines_count.ico.png",
      "legacyName": "parallel_lines_count.ico.png",
      "aliases": [],
      "tags": ["apps", "base", "components", "count", "lines", "parallel", "tool"],
      "products": [],
      "variants": {
        "24": "assets/apps/components/base-tool/parallel-lines-count/24.png",
        "48": "assets/apps/components/base-tool/parallel-lines-count/48.png",
        "72": "assets/apps/components/base-tool/parallel-lines-count/72.png"
      },
      "svg": {}
    },
    {
      "id": "common.higgs.eye",
      "name": "Mostrar",
      "description": "Muestra u oculta un elemento.",
      "category": "common.higgs",
      "source": "Common/Higgs/eye.ico.png",
      "legacyName": "eye.ico.png",
      "aliases": [],
      "tags": ["common", "eye", "higgs", "mostrar", "ojo", "visible"],
      "products": ["presenter-desktop"],
      "variants": {},
      "svg": {
        "light": "assets/common/higgs/eye/light.svg",
        "dark": "assets/common/higgs/eye/dark.svg"
      }
    }
  ]
}
```

Un icono tiene PNG por tamaño (`variants`), dibujo vectorial (`svg`) o ambos
durante una migración; nunca ninguno de los dos.

## Campos

| Campo | Tipo | Significado |
| --- | --- | --- |
| `schemaVersion` | número | Versión del formato del manifiesto. Hoy `1`; cambia solo con cambios incompatibles del formato |
| `libraryVersion` | texto | Versión de Higgs Icons (`version` de `package.json`) |
| `icons` | arreglo | Iconos ordenados por `id` |
| `id` | texto | **ID canónico**: estable entre versiones; minúsculas, segmentos con `.` y palabras con `-` |
| `name` | texto | Nombre legible: el curado o, si no hay, el derivado del nombre heredado |
| `description` | texto | Descripción curada; vacía si no hay |
| `category` | texto | El ID sin su último segmento |
| `source` | texto | Ruta del icono en el inventario del repositorio |
| `legacyName` | texto | Nombre del directorio heredado (`*.ico.png`) |
| `aliases` | arreglo de texto | Nombres alternativos curados |
| `tags` | arreglo de texto | Palabras del ID y del nombre más los tags curados, en minúsculas y ordenadas |
| `products` | arreglo de texto | Productos que usan el icono, si está curado (`skriba-web`, `skriba-desktop`…) |
| `variants` | objeto | Tamaño en píxeles → ruta del PNG, relativa a la carpeta de `dist/web/` (o a `library_root` en escritorio). Vacío en los iconos que solo tienen dibujo vectorial |
| `svg` | objeto | Desde 0.2.0. `light` y `dark` → ruta del SVG de cada tema, relativa como las de `variants`. Vacío en los iconos que solo tienen PNG. El SVG tiene `viewBox="0 0 24 24"` y se dibuja a cualquier tamaño (24, 30, 36, 42, 48, 60, 72 y 128 px son los admitidos) |

Los campos `name`, `description`, `aliases`, `tags` y `products` se curan en
`metadata/overrides.json` ([mantenimiento.md](mantenimiento.md)).

## Garantías

- Un `id` publicado no cambia ni se reutiliza para otro icono.
- Las rutas de `variants` y de `svg` siempre usan `/` y nunca son absolutas.
- Si `svg` no está vacío, siempre trae `light` y `dark`; el oscuro se deriva del
  claro invirtiendo la paleta cuando el inventario no trae uno propio.
- Un campo nuevo se añade sin quitar los existentes; quitar o cambiar el tipo de
  un campo sube `schemaVersion`.
