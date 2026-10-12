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
   `Apps/`, `Common/` o `Engines/`, con un PNG por tamaño llamado por su tamaño en
   píxeles: `24.png`, `48.png`, `72.png`. Los PNG sueltos fuera de un directorio
   `.ico.png` se ignoran.
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
- `catalogo-iconos.html` (raíz del repositorio) es un catálogo estático que GitHub
  Pages publica en
  [jalexiscv.github.io/higgs-icons](https://jalexiscv.github.io/higgs-icons/). No
  lo regenera `tools/build.mjs`: si cambia el inventario, hay que actualizarlo
  aparte.

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
