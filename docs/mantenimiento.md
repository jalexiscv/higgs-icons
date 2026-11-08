# Mantenimiento de la biblioteca

Guía para quien mantiene Higgs Icons: añadir iconos, curar sus nombres, generar
y publicar una versión. Las reglas de trabajo completas están en
[protocols/](protocols/Fable/Execution.md); el funcionamiento interno, en
[arquitectura.md](arquitectura.md).

## Requisitos

- Node.js 20 o superior (sin `npm install`: no hay dependencias).
- Para comprobar la biblioteca C++: CMake 3.20+ y un compilador C++20 (en Windows,
  Visual Studio 2022 Build Tools).

## Comandos

```powershell
node --test                  # pruebas del generador y del módulo web
node tools/build.mjs         # genera dist/web, dist/desktop y dist/catalog
npm run check                # las dos anteriores
```

Compilación de `dist/desktop` como en la CI (en Windows, desde una consola con
el entorno de Visual Studio):

```powershell
cmake -S dist/desktop -B "$env:TEMP\higgs-icons-build"
cmake --build "$env:TEMP\higgs-icons-build" --config Release --target higgs_icons
```

## Añadir iconos

1. **Confirmar la procedencia** y el permiso de redistribución del grupo
   ([RIGHTS-AND-PUBLISHING.md](../RIGHTS-AND-PUBLISHING.md)). Sin eso, no se
   añade.
2. **Colocar cada icono** como un directorio `<Nombre>.ico.png` dentro de
   `Apps/`, `Common/` o `Engines/`. Los iconos nuevos se dibujan en **SVG**: un
   `light.svg` con `viewBox="0 0 24 24"`, trazos de 1 px alineados al píxel,
   área útil de 4 a 20, la paleta de la biblioteca (tinta `#2E3238`, gris
   `#9499A1`, azul `#06A9F4`, naranja `#FF6600`, rojo `#EA3323`, verde
   `#1CB574`) y solo `path`, `rect`, `circle`, `ellipse` y `g`: sin `<text>`,
   máscaras, `<style>` ni referencias externas (el generador rechaza
   `<script>`, `<image>`, `<use>`, `href` y `url(` externos). El dibujo oscuro
   lo deriva el generador cambiando la tinta por `#E6E9EF` y el gris por
   `#80868F`; solo si hace falta otro, se añade un `dark.svg` a mano. El skill
   `iconos-svg-ui` (`.claude/skills/`) describe el estilo completo y trae el
   validador `iconos_check.py`. Desde 0.2.1 no queda ningún icono en PNG; el
   generador aún los acepta (un archivo por tamaño, `24.png`…) por
   compatibilidad. Los archivos sueltos fuera de un directorio `.ico.png` se
   ignoran.
3. **Registrar su ID** en `metadata/ids.json`: la clave es la ruta del directorio
   y el valor, el ID canónico. Se sigue la forma de los existentes: segmentos de
   la ruta en minúsculas separados por `.`, palabras con `-`, sin las carpetas
   `RcBin`, `RCBin`, `rcBin` ni `Res`:

   ```json
   "Engines/PrintUI/RcBin/file_options.ico.png": "engines.print-ui.file-options"
   ```

   El generador se detiene si falta una ruta del inventario, si sobra una que no
   existe o si dos iconos comparten ID.
4. **Generar y probar:** `npm run check` debe terminar con
   `Built N icons…`, donde N es el total anterior más los añadidos.
5. **Comprobar en el catálogo** (`dist/catalog/`) que los iconos se ven y se
   encuentran.

Los lotes grandes se reparten en commits de unos 20 iconos:
`recursos: añade 20 iconos de PrintUI (3/8)`.

## Reorganizar o renombrar archivos

El ID no depende de la ruta: al mover un directorio `.ico.png`, se cambia la
**clave** en `metadata/ids.json` y se conserva el **valor**. Las aplicaciones no
notan el cambio.

Cambiar o quitar un ID publicado rompe a las aplicaciones que lo usan: requiere
decisión del autor, una versión menor o mayor y aviso en el changelog.

## Curar nombres, descripciones y tags

`metadata/overrides.json` añade información legible sin tocar los archivos:

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

- Solo se admiten esas cinco claves; `aliases`, `tags` y `products` son arreglos.
  Un ID desconocido o una clave distinta detienen la generación.
- Un alias debe ser único para que `get` y `find_legacy` lo resuelvan.
- Curar en español los iconos más usados es lo que permite encontrarlos con
  búsquedas como "líneas paralelas".

## Catálogos

- `dist/catalog/` se genera con `tools/build.mjs` desde `catalog/` y muestra el ID
  canónico.
- GitHub Pages sirve la raíz del repositorio: `index.html` enlaza a dos catálogos
  estáticos.
  - `catalogo-iconos-svg.html`, con **solo los iconos vectoriales** en tema claro
    y oscuro (los dibujos van incrustados como `<symbol>`, con el oscuro
    derivado), se regenera con `node tools/catalogo-svg.mjs` cada vez que se
    migran iconos.
  - `catalogo-iconos.html`, el catálogo heredado organizado por carpetas de
    origen, no lo regenera ninguna herramienta: si cambia el inventario, hay
    que actualizarlo aparte. Desde 0.2.1 sus 2949 tarjetas muestran el
    `light.svg` de cada icono a 24, 48 y 72 px, porque los PNG ya no existen.
    Los iconos de `Common/Higgs/` no figuran en él.
- `dist/catalog/` tiene una casilla **Tema oscuro** que muestra el `dark.svg` de
  los iconos vectoriales sobre fondo oscuro.

## Publicar una versión

Las aplicaciones consumen etiquetas `vX.Y.Z` ([obtener-desde-github.md](obtener-desde-github.md)).
Cada cambio que altera lo que reciben (iconos, metadatos, generador, módulo web,
catálogo) sale en una versión nueva ([protocols/Releases.md](protocols/Releases.md)):

```powershell
npm version patch --no-git-tag-version     # 0.1.0 -> 0.1.1 en package.json
npm run check                              # y la compilación de dist/desktop
git add package.json changelogs/ <archivos del cambio>
git commit -m "feat(recursos): ..."
git tag -a v0.1.1 -m "Higgs Icons 0.1.1"
git push origin main --follow-tags
```

El cambio se registra en [changelogs/](../changelogs/CHANGELOG.md)
([protocols/Changelogs.md](protocols/Changelogs.md)). Después, cada proyecto
consumidor actualiza su `GIT_TAG`, su submódulo o su script de copia.

## Integración continua

`.github/workflows/ci.yml` se ejecuta en cada push y pull request en
`windows-latest` con Node 22: pruebas, generación y compilación de
`dist/desktop`. Una versión solo se etiqueta con la CI en verde.
